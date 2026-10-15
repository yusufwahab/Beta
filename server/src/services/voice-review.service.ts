import {z} from 'zod';
import type {PoolClient} from 'pg';
import type {Command} from './intent.service.js';
import {normalize} from './intent.service.js';
import type {VoiceAction} from '../voice-routes.js';
import {validateVoiceAction} from './voice-action.js';
import {AppError} from '../db.js';

export function voiceReviewFields(action:VoiceAction,command:Command):Record<string,string>{
 const e=command.entities,b=action.body;
 if(action.path==='/sales'){const item=(b.items as {quantity:number;unit_price:string}[])[0];return {product:e.product??'',quantity:String(item.quantity),unit_price:item.unit_price,payment_status:String(b.payment_status),customer:e.customer??'',paid_amount:String(b.paid_amount??'')};}
 if(action.path==='/expenses')return {amount:String(b.amount),category:String(b.category),description:String(b.description),occurred_on:String(b.occurred_on)};
 if(action.path==='/products/:id/stock')return {product:e.product??'',quantity:String(b.quantity),reason:String(b.reason)};
 return {customer:e.customer??'',amount:String(b.amount),...(action.path==='/debts'?{description:String(b.description)}:{})};
}
export async function editVoiceAction(db:PoolClient,b:string,old:VoiceAction,command:Command,edits:Record<string,string>){
 const allowed=voiceReviewFields(old,command);
 if(Object.keys(edits).some(key=>!(key in allowed)))throw new AppError(400,'This field cannot be edited for this transaction');
 const fields={...allowed,...edits};const action:VoiceAction={...old,path:old.path,params:{...old.params},body:{...old.body,idempotency_key:crypto.randomUUID()}};
 const entities={...command.entities};
 if('product' in fields){const matches=(await db.query('select id,name from products where business_id=$1 and not archived',[b])).rows.filter(p=>normalize(p.name)===normalize(fields.product));if(matches.length!==1)throw new AppError(400,'Choose one existing inventory product');entities.product=matches[0].name;if(action.path==='/sales')action.body.items=[{product_id:matches[0].id,quantity:Number(fields.quantity),unit_price:fields.unit_price}];else action.params.id=matches[0].id;}
 if('quantity' in fields){entities.quantity=Number(fields.quantity);if(action.path!=='/sales')action.body.quantity=entities.quantity;}
 if('unit_price' in fields)entities.unit_price=fields.unit_price;
 for(const key of ['amount','category','description','occurred_on','reason'] as const)if(key in fields){action.body[key]=fields[key];if(key==='amount'||key==='category')entities[key]=fields[key];}
 if('payment_status' in fields){action.body.payment_status=fields.payment_status;delete action.body.paid_amount;delete action.body.customer_id;if(fields.payment_status==='partial')action.body.paid_amount=fields.paid_amount;}
 if('customer' in fields){
  if(fields.customer.trim()){const matches=(await db.query('select id,name from customers where business_id=$1',[b])).rows.filter(c=>normalize(c.name)===normalize(fields.customer));if(matches.length!==1)throw new AppError(400,'Choose one existing customer');action.body.customer_id=matches[0].id;entities.customer=matches[0].name;
   if(action.path==='/debts/:id/repayments'){const debts=(await db.query('select d.id from debts d left join sales s on s.id=d.sale_id where d.business_id=$1 and d.customer_id=$2 and s.reversed_at is null and d.amount>coalesce((select sum(amount) from debt_repayments where debt_id=d.id),0)',[b,matches[0].id])).rows;if(debts.length!==1)throw new AppError(400,'Select the debt on the customer debts page');action.params.id=debts[0].id;delete action.body.customer_id;}
  }else if(action.path!=='/sales')throw new AppError(400,'A customer is required');else delete entities.customer;
 }
 action.body=validateVoiceAction(action.path,action.body) as Record<string,unknown>;for(const value of Object.values(action.params))z.uuid().parse(value);
 return {action,command:{...command,entities,missing:[],confidence:0.9}};
}
