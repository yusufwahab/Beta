import type { PoolClient } from 'pg';
import { saleSchema } from '@beta/shared';
import { AppError,audit } from '../db.js';
export async function createSale(db:PoolClient,business:string,user:string,body:unknown,preview=false){
 const input=saleSchema.parse(body);
 await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`${business}:${input.idempotency_key}`]);
 const existing=await db.query('select * from sales where business_id=$1 and idempotency_key=$2',[business,input.idempotency_key]);if(existing.rowCount&&!preview)return existing.rows[0];
 const businessRow=await db.query('select allow_negative_stock from businesses where id=$1',[business]);
 if(input.customer_id){const c=await db.query('select id from customers where business_id=$1 and id=$2',[business,input.customer_id]);if(!c.rowCount)throw new AppError(400,'Customer not found');}
 if(input.voice_interaction_id){const v=await db.query('select id from voice_interactions where business_id=$1 and id=$2',[business,input.voice_interaction_id]);if(!v.rowCount)throw new AppError(400,'Voice interaction not found');}
 const ids=input.items.map(x=>x.product_id);
 if(new Set(ids).size!==ids.length)throw new AppError(400,'Combine duplicate products into one line');
 const products=await db.query('select * from products where business_id=$1 and id=any($2::uuid[]) and not archived order by id for update',[business,ids]);
 for(const item of input.items){const p=products.rows.find(p=>p.id===item.product_id);if(!p)throw new AppError(400,'Product unavailable');if(!businessRow.rows[0].allow_negative_stock&&p.stock_quantity<item.quantity)throw new AppError(409,`Not enough stock for ${p.name}`);}
 const totals=await db.query("select sum((i->>'quantity')::integer*(i->>'unit_price')::numeric)::numeric(14,2)::text total from jsonb_array_elements($1::jsonb) i",[JSON.stringify(input.items)]);
 const total=totals.rows[0].total;
 const paid=input.payment_status==='paid'?total:input.payment_status==='partial'?input.paid_amount!:'0';
 const valid=await db.query('select $1::numeric <= $2::numeric ok, $1::numeric > 0 and $1::numeric < $2::numeric partial_ok',[paid,total]);
 if(!valid.rows[0].ok||input.payment_status==='partial'&&!valid.rows[0].partial_ok)throw new AppError(400,'Partial payment must be greater than zero and less than the total');
 if(preview)return {total,paid_amount:paid,items:input.items};
 const r=await db.query('insert into sales(business_id,customer_id,total,paid_amount,payment_status,source,voice_interaction_id,idempotency_key,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *',[business,input.customer_id??null,total,paid,input.payment_status,input.source,input.voice_interaction_id??null,input.idempotency_key,user]);const sale=r.rows[0];
 for(const item of input.items){const p=products.rows.find(p=>p.id===item.product_id);await db.query('insert into sale_items(business_id,sale_id,product_id,product_name,quantity,unit_price,cost_price) values($1,$2,$3,$4,$5,$6,$7)',[business,sale.id,p.id,p.name,item.quantity,item.unit_price,p.cost_price]);await db.query('update products set stock_quantity=stock_quantity-$1 where business_id=$2 and id=$3',[item.quantity,business,p.id]);await db.query('insert into stock_movements(business_id,product_id,sale_id,quantity,reason,created_by) values($1,$2,$3,$4,$5,$6)',[business,p.id,sale.id,-item.quantity,'sale',user]);}
 if(['unpaid','partial'].includes(input.payment_status))await db.query('insert into debts(business_id,customer_id,sale_id,amount,description,idempotency_key,created_by) values($1,$2,$3,$4::numeric-$5::numeric,$6,$7,$8)',[business,input.customer_id,sale.id,total,paid,'Credit sale',input.idempotency_key,user]);
 await audit(db,business,user,'sale_confirmed',sale.id);return sale;
}
export async function reverseSale(db:PoolClient,business:string,user:string,id:string,reason:string){
 const r=await db.query('select * from sales where business_id=$1 and id=$2 for update',[business,id]);if(!r.rowCount)throw new AppError(404,'Sale not found');if(r.rows[0].reversed_at)return r.rows[0];
 await db.query('select id from debts where business_id=$1 and sale_id=$2 for update',[business,id]);
 const repayments=await db.query('select r.id from debt_repayments r join debts d on d.id=r.debt_id where d.business_id=$1 and d.sale_id=$2',[business,id]);if(repayments.rowCount)throw new AppError(409,'This sale has repayments. Resolve the debt before reversing it.');
 const items=await db.query('select * from sale_items where business_id=$1 and sale_id=$2 order by product_id',[business,id]);
 for(const item of items.rows){await db.query('update products set stock_quantity=stock_quantity+$1 where business_id=$2 and id=$3',[item.quantity,business,item.product_id]);await db.query('insert into stock_movements(business_id,product_id,sale_id,quantity,reason,created_by) values($1,$2,$3,$4,$5,$6)',[business,item.product_id,id,item.quantity,'sale reversal',user]);}
 const updated=await db.query('update sales set reversed_at=now(),reversal_reason=$3 where business_id=$1 and id=$2 returning *',[business,id,reason]);await audit(db,business,user,'sale_reversed',id);return updated.rows[0];
}
