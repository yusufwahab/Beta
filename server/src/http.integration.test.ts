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
  res.end(JSON.stringify({id:token==='Bearer beta-test-user'?user:outsider,aud:'authenticated',role:'authenticated',is_anonymous:token==='Bearer beta-test-user',...(token==='Bearer beta-test-outsider'?{email:'test@example.invalid',email_confirmed_at:new Date().toISOString()}:{}),app_metadata:{},user_metadata:{}}));
 });
 await new Promise<void>(resolve=>authStub.listen(0,'127.0.0.1',resolve));
 process.env.SUPABASE_URL=`http://127.0.0.1:${(authStub.address() as AddressInfo).port}`;
 process.env.SUPABASE_SERVICE_ROLE_KEY='local-auth-test-double';
 process.env.DATABASE_URL=process.env.BETA_HTTP_TEST_DATABASE_URL;
 process.env.PORT='0';
 process.env.TRUST_PROXY_HOPS='1';
 const {listener}=await import('./index.js');
 if(!listener.listening)await new Promise<void>(resolve=>listener.once('listening',resolve));
 const {pool}=await import('./db.js');
 await pool.query('insert into auth.users(id) values($1),($2)',[user,outsider]);
 const base=`http://127.0.0.1:${(listener.address() as AddressInfo).port}/api`;
 async function request(path:string,body?:unknown,expected=200,token='beta-test-user',method?:string){
  const r=await fetch(base+path,{method:method??(body?'POST':'GET'),headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,'X-Forwarded-For':token==='beta-test-outsider'?'198.51.100.20':'198.51.100.10'},body:body?JSON.stringify(body):undefined});
  const payload=await r.json() as any;
  assert.equal(r.status,expected,JSON.stringify(payload));
  return payload.data;
 }
 const key=()=>({idempotency_key:crypto.randomUUID()});
 try{
  await request('/me',undefined,401,'invalid');const rejectedOrigin=await fetch(base+'/me',{headers:{Origin:'https://untrusted.example',Authorization:'Bearer beta-test-user'}});assert.equal(rejectedOrigin.status,403);
  const business=await request('/onboarding',{profile:{trader_name:'API Trader',preferred_language:'en'},business:{name:'API Store',category:'Groceries',location:'Lagos',allow_negative_stock:false}},201);
  const prefix=`/businesses/${business.id}`;
  assert.equal((await request('/me')).businesses[0].name,'API Store');
  assert.equal((await request(prefix+'/journey')).step,'product');
  assert.equal((await request(prefix+'/journey',{action:'visit'})).state.visits,1);
  await request(prefix+'/journey',{action:'pause'});assert.equal((await request(prefix+'/journey')).state.paused,true);
  await request(prefix+'/journey',{action:'resume'});
  await request(prefix+'/products',{name:'',selling_price:'10'},400);assert.equal((await request(prefix+'/journey')).step,'product');
  await request(prefix+'/products',undefined,403,'beta-test-outsider');
  const product=await request(prefix+'/products',{name:'Oil',category:'Groceries',selling_price:'2500',cost_price:'2000',stock_quantity:10,low_stock_threshold:3});
  assert.equal((await request(prefix+'/journey')).step,'sale');
  const saleInput={...key(),items:[{product_id:product.id,quantity:3,unit_price:'2500'}],payment_status:'paid',source:'manual'};
  const preview=await request(prefix+'/sales/preview',saleInput);assert.equal(preview.total,'7500.00');assert.equal((await request(prefix+'/journey')).step,'sale');
  assert.equal((await request(prefix+'/sales')).length,0);
  const sale=await request(prefix+'/sales',saleInput);assert.equal(sale.total,'7500.00');assert.equal((await request(prefix+'/journey')).step,'expense');assert.equal((await request(prefix+'/journey',{action:'visit'})).state.visits,2);
  assert.equal((await request(prefix+'/sales',saleInput)).id,sale.id);
  assert.equal((await request(prefix+'/products'))[0].stock_quantity,7);
  assert.equal((await request(prefix+`/sales/${sale.id}`)).items[0].quantity,3);
  assert.equal((await request(prefix+'/analytics')).sales.today,'7500.00');
  const occurred_on=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  await request(prefix+'/expenses',{...key(),amount:'500',category:'Transport',description:'Delivery',occurred_on});
  assert.equal((await request(prefix+'/expenses/summary'))[0].total,'500.00');assert.equal((await request(prefix+'/journey')).step,'debt');
  const customer=await request(prefix+'/customers',{name:'Chika',phone:'08000000000'});
  const debt=await request(prefix+'/debts',{...key(),customer_id:customer.id,amount:'1000',description:'Previous credit'});
  assert.equal((await request(prefix+'/journey')).step,'summary');assert.equal((await request(prefix+'/journey',{action:'summary',step:'summary'})).step,null);
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
  // ASR is an explicit transcript fixture; parsing, HTTP, RLS and PostgreSQL writes are real.
  async function command(transcript:string,extra:Record<string,string>={}){const voice=(await pool.query('insert into voice_interactions(business_id,created_by,transcript,language,model) values($1,$2,$3,$4,$5) returning id',[business.id,user,transcript,'en','NCAIR1/NigerianAccentedEnglish'])).rows[0];return request(prefix+'/voice/command',{voice_interaction_id:voice.id,...extra});}
  const countBefore=(await request(prefix+'/sales')).length;
  const mistaken=await command('I sold three bags of Oil at fifteen thousand naira each');assert.equal(mistaken.preview.total,'45000.00');
  const corrected=await command('No, I said two bags.',{correction_of:mistaken.confirmation_id});assert.equal(corrected.preview.total,'30000.00');
  await request(prefix+'/voice/confirm',{confirmation_id:mistaken.confirmation_id,confirmed:true},409);
  const edited=await request(prefix+'/voice/review',{confirmation_id:corrected.confirmation_id,language:'en',edits:{quantity:'1',unit_price:'12000'}});assert.equal(edited.preview.total,'12000.00');assert.notEqual(edited.confirmation_id,corrected.confirmation_id);
  await request(prefix+'/voice/confirm',{confirmation_id:corrected.confirmation_id,confirmed:true},409);
  await request(prefix+'/voice/review',{confirmation_id:edited.confirmation_id,edits:{quantity:'-1'}},400);
  await request(prefix+'/voice/review',{confirmation_id:edited.confirmation_id,edits:{product:'A product that does not exist'}},400);
  await request(prefix+'/voice/review',{confirmation_id:edited.confirmation_id,edits:{amount:'1'}},400);
  assert.equal((await request(prefix+'/sales')).length,countBefore);assert.equal((await request(prefix+'/products'))[0].stock_quantity,13);
  await request(prefix+'/voice/cancel',{cancelled:true});
  await request(prefix+'/voice/confirm',{confirmation_id:edited.confirmation_id,confirmed:true},409);
  const missing=await command('I sold two Oil');assert.deepEqual(missing.command.missing,['unit_price']);assert.equal(missing.confirmation_id,undefined);
  const draft=await command('Fifteen thousand');assert.equal(draft.preview.total,'30000.00');assert.ok(draft.confirmation_id);const repeated=await command('yes');assert.equal(repeated.confirmation_id,draft.confirmation_id);assert.equal(repeated.command.entities.product,'Oil');
  assert.equal((await request(prefix+'/sales')).length,countBefore);assert.equal((await request(prefix+'/products'))[0].stock_quantity,13);
  await request(prefix+'/voice/confirm',{confirmation_id:draft.confirmation_id,confirmed:false},400);
  await request(prefix+'/voice/confirm',{confirmation_id:draft.confirmation_id,confirmed:true},403,'beta-test-outsider');
  const confirmed=await request(prefix+'/voice/confirm',{confirmation_id:draft.confirmation_id,confirmed:true});assert.equal(confirmed.total,'30000.00');
  assert.equal((await request(prefix+'/voice/confirm',{confirmation_id:draft.confirmation_id,confirmed:true})).id,confirmed.id);
  assert.equal((await request(prefix+'/products'))[0].stock_quantity,11);
  const query=await command('How much did I make today?');assert.match(query.response,/32500/);assert.equal(query.confirmation_id,undefined);assert.match((await command('profit today')).response,/26000/);assert.match((await command('sales last week')).response,/0/);assert.match((await command('sales yesterday')).response,/0/);
  const initialExpense=await command('I spent 500 on transport');const expenseDraft=await request(prefix+'/voice/review',{confirmation_id:initialExpense.confirmation_id,language:'en',edits:{description:'Market delivery'}});assert.equal(expenseDraft.review_fields.description,'Market delivery');assert.ok(expenseDraft.confirmation_id);const expensesBefore=(await request(prefix+'/expenses')).length;
  await request(prefix+'/voice/confirm',{confirmation_id:expenseDraft.confirmation_id,confirmed:true});assert.equal((await request(prefix+'/expenses')).length,expensesBefore+1);
  const initialStock=await command('add stock two Oil');const stockDraft=await request(prefix+'/voice/review',{confirmation_id:initialStock.confirmation_id,edits:{reason:'New delivery'}});assert.ok(stockDraft.confirmation_id);await request(prefix+'/voice/confirm',{confirmation_id:stockDraft.confirmation_id,confirmed:true});assert.equal((await request(prefix+'/products'))[0].stock_quantity,13);
  await request(prefix+'/customers',{name:'Ada'});const initialDebt=await command('I lent 1000 to Ada');const debtDraft=await request(prefix+'/voice/review',{confirmation_id:initialDebt.confirmation_id,edits:{description:'Reviewed customer credit'}});assert.ok(debtDraft.confirmation_id);await request(prefix+'/voice/confirm',{confirmation_id:debtDraft.confirmation_id,confirmed:true});
  const repaymentMissing=await command('Ada repaid 250');assert.deepEqual(repaymentMissing.command.missing,['customer']);const initialRepayment=await command('Ada');const repaymentDraft=await request(prefix+'/voice/review',{confirmation_id:initialRepayment.confirmation_id,edits:{amount:'250'}});assert.ok(repaymentDraft.confirmation_id);await request(prefix+'/voice/confirm',{confirmation_id:repaymentDraft.confirmation_id,confirmed:true});assert.equal((await request(prefix+'/debts')).find((d:any)=>d.customer_name==='Ada').balance,'750.00');const cancelledDraft=await command('add stock two Oil');await request(prefix+'/voice/cancel',{cancelled:true});await request(prefix+'/voice/confirm',{confirmation_id:cancelledDraft.confirmation_id,confirmed:true},409);assert.equal((await request(prefix+'/products'))[0].stock_quantity,13);
  // Separate trader: skipping and known steps persist without creating fake records.
  const other=await request('/onboarding',{profile:{trader_name:'Returning Trader',preferred_language:'yo'},business:{name:'Other Store',category:'Food'}},201,'beta-test-outsider');
  const otherPrefix=`/businesses/${other.id}`;const otherRequest=(path:string,body?:unknown)=>request(otherPrefix+path,body,200,'beta-test-outsider');
  await otherRequest('/journey',{action:'visit'});await otherRequest('/journey',{action:'known',step:'product'});await otherRequest('/journey',{action:'skip',step:'sale'});
  assert.equal((await otherRequest('/journey')).step,'expense');assert.equal((await otherRequest('/products')).length,0);assert.equal((await otherRequest('/sales')).length,0);
  assert.equal((await request(prefix+'/journey')).state.skipped.length,0);
  const lowProduct=await otherRequest('/products',{name:'Rice',selling_price:'22500',stock_quantity:5,low_stock_threshold:5});
  await otherRequest('/sales',{...key(),items:[{product_id:lowProduct.id,quantity:2,unit_price:'22500'}],payment_status:'paid',source:'manual'});
  await otherRequest('/journey',{action:'known',step:'expense'});await otherRequest('/journey',{action:'skip',step:'debt'});await otherRequest('/journey',{action:'summary',step:'summary'});
  const tip=await otherRequest('/journey');assert.equal(tip.step,null);assert.equal(tip.recommendation.kind,'expense');assert.equal(tip.recommendation.amount,'45000.00');
  const stockTip=await otherRequest('/journey',{action:'dismiss',recommendation_id:tip.recommendation.id});assert.equal(stockTip.recommendation.kind,'stock');assert.equal(stockTip.recommendation.quantity,3);
  await otherRequest('/journey',{action:'dismiss',recommendation_id:stockTip.recommendation.id});assert.equal((await otherRequest('/journey')).recommendation,null);
  assert.equal((await otherRequest('/journey',{action:'visit'})).state.visits,2);
  assert.equal((await otherRequest('/journey')).state.known.includes('expense'),true);

 }finally{
  await new Promise<void>(resolve=>listener.close(()=>resolve()));
  await new Promise<void>(resolve=>authStub.close(()=>resolve()));
  await pool.end();
 }
});
