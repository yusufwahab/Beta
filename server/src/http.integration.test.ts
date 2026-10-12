import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
// Uses real PostgreSQL and an explicit local Supabase Auth test double. Not a live Auth test.
test('HTTP API: onboarding, sales, expenses, debts, ajo, reporting and isolation',{
 skip:!process.env.BETA_HTTP_TEST_DATABASE_URL,
},async()=>{
 const user=crypto.randomUUID();
 const outsider=crypto.randomUUID();
 const authStub=createServer((req,res)=>{
  res.setHeader('Content-Type','application/json');
  const token=req.headers.authorization;
  if(token!=='Bearer beta-test-user'&&token!=='Bearer beta-test-outsider'){
   res.writeHead(401);res.end(JSON.stringify({message:'Invalid token'}));return;
  }
  res.end(JSON.stringify({id:token==='Bearer beta-test-user'?user:outsider,aud:'authenticated',role:'authenticated',email:'test@example.invalid',app_metadata:{},user_metadata:{}}));
 });
 await new Promise<void>(resolve=>authStub.listen(0,'127.0.0.1',resolve));
 process.env.SUPABASE_URL=`http://127.0.0.1:${(authStub.address() as AddressInfo).port}`;
 process.env.SUPABASE_SERVICE_ROLE_KEY='local-auth-test-double';
 process.env.DATABASE_URL=process.env.BETA_HTTP_TEST_DATABASE_URL;
 process.env.PORT='0';
 const {listener}=await import('./index.js');
 if(!listener.listening)await new Promise<void>(resolve=>listener.once('listening',resolve));
 const {pool}=await import('./db.js');
 await pool.query('insert into auth.users(id) values($1),($2)',[user,outsider]);
 const base=`http://127.0.0.1:${(listener.address() as AddressInfo).port}/api`;
 async function request(path:string,body?:unknown,expected=200,token='beta-test-user',method?:string){
  const r=await fetch(base+path,{method:method??(body?'POST':'GET'),headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:body?JSON.stringify(body):undefined});
  const payload=await r.json() as any;
  assert.equal(r.status,expected,JSON.stringify(payload));
  return payload.data;
 }
 const key=()=>({idempotency_key:crypto.randomUUID()});
 try{
  await request('/me',undefined,401,'invalid');
  const business=await request('/onboarding',{profile:{trader_name:'API Trader',preferred_language:'en'},business:{name:'API Store',category:'Groceries',location:'Lagos',allow_negative_stock:false}},201);
  const prefix=`/businesses/${business.id}`;
  assert.equal((await request('/me')).businesses[0].name,'API Store');
  await request(prefix+'/products',undefined,403,'beta-test-outsider');
  const product=await request(prefix+'/products',{name:'Oil',category:'Groceries',selling_price:'2500',cost_price:'2000',stock_quantity:10,low_stock_threshold:3});
  const saleInput={...key(),items:[{product_id:product.id,quantity:3,unit_price:'2500'}],payment_status:'paid',source:'manual'};
  const preview=await request(prefix+'/sales/preview',saleInput);assert.equal(preview.total,'7500.00');
  assert.equal((await request(prefix+'/sales')).length,0);
  const sale=await request(prefix+'/sales',saleInput);assert.equal(sale.total,'7500.00');
  assert.equal((await request(prefix+'/sales',saleInput)).id,sale.id);
  assert.equal((await request(prefix+'/products'))[0].stock_quantity,7);
  assert.equal((await request(prefix+`/sales/${sale.id}`)).items[0].quantity,3);
  assert.equal((await request(prefix+'/analytics')).sales.today,'7500.00');
  const occurred_on=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  await request(prefix+'/expenses',{...key(),amount:'500',category:'Transport',description:'Delivery',occurred_on});
  assert.equal((await request(prefix+'/expenses/summary'))[0].total,'500.00');
  const customer=await request(prefix+'/customers',{name:'Chika',phone:'08000000000'});
  const debt=await request(prefix+'/debts',{...key(),customer_id:customer.id,amount:'1000',description:'Previous credit'});
  const repayment={...key(),amount:'250'};
  await request(prefix+`/debts/${debt.id}/repayments`,repayment);
  await request(prefix+`/debts/${debt.id}/repayments`,repayment);
  assert.equal((await request(prefix+'/debts'))[0].balance,'750.00');
  await request(prefix+`/debts/${debt.id}/repayments`,{...key(),amount:'800'},409);
  const credit=await request(prefix+'/sales',{...key(),items:[{product_id:product.id,quantity:1,unit_price:'2500'}],source:'manual',payment_status:'partial',paid_amount:'500',customer_id:customer.id});
  const creditDebt=(await request(prefix+'/debts')).find((d:any)=>d.sale_id===credit.id);
  await request(prefix+`/debts/${creditDebt.id}/repayments`,{...key(),amount:'2000'});
  assert.equal((await request(prefix+`/sales/${credit.id}`)).payment_status,'paid');
  await request(prefix+`/sales/${credit.id}/reverse`,{reason:'Correction'},409);
  const group=await request(prefix+'/ajo/groups',{name:'Market ajo',contribution_amount:'1000',frequency:'weekly'});
  const member=await request(prefix+`/ajo/groups/${group.id}/members`,{name:'API Trader'});
  await request(prefix+'/ajo/contributions',{...key(),group_id:group.id,member_id:member.id,amount:'1000',occurred_on});
  await request(prefix+'/ajo/payouts',{...key(),group_id:group.id,member_id:member.id,amount:'500',occurred_on});
  const ajo=(await request(prefix+'/ajo/groups'))[0];assert.equal(ajo.contributions,'1000.00');assert.equal(ajo.payouts,'500.00');
  const report=await request(prefix+'/passport');assert.equal(report.sales.total,'10000.00');assert.equal(report.expenses.total,'500.00');assert.equal(report.ajo.contributions,'1000.00');
  const restock={...key(),quantity:4,reason:'Restock'};await request(prefix+`/products/${product.id}/stock`,restock);await request(prefix+`/products/${product.id}/stock`,restock);assert.equal((await request(prefix+'/products'))[0].stock_quantity,10);
  await request(prefix+`/sales/${sale.id}/reverse`,{reason:'Correct recorded quantity'});assert.equal((await request(prefix+'/products'))[0].stock_quantity,13);
  assert.equal((await request(prefix+'/analytics')).sales.today,'2500.00');
  await request('/settings',{trader_name:'Updated Trader',preferred_language:'yo'},200,'beta-test-user','PATCH');assert.equal((await request('/me')).profile.preferred_language,'yo');
  await request(prefix+'/sales',{...key(),items:[{product_id:product.id,quantity:1,unit_price:'1.001'}],source:'manual',payment_status:'paid'},400);
 }finally{
  await new Promise<void>(resolve=>listener.close(()=>resolve()));
  await new Promise<void>(resolve=>authStub.close(()=>resolve()));
  await pool.end();
 }
});
