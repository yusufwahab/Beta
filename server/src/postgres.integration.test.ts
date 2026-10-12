import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pool,transaction,authorize} from './db.js';
import {createSale,reverseSale} from './services/sales.service.js';
// Only run against an empty, explicitly disposable local test database.
test('PostgreSQL: migration, tenant isolation, atomic sales, race protection and reversal',{skip:!process.env.BETA_TEST_DATABASE_URL},async()=>{
 process.env.DATABASE_URL=process.env.BETA_TEST_DATABASE_URL;
 const db=await pool.connect();
 try{
 await db.query("create schema auth; create table auth.users(id uuid primary key); do $$ begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;");
 await db.query(await readFile(new URL('../../supabase/migrations/202610120001_beta.sql',import.meta.url),'utf8'));
 const alice='00000000-0000-4000-8000-000000000001',bob='00000000-0000-4000-8000-000000000002';
 await db.query('insert into auth.users values($1),($2)',[alice,bob]);
 const business=await transaction(alice,async c=>{const b=(await c.query("insert into businesses(owner_id,name,category) values($1,'Alice Store','Groceries') returning id",[alice])).rows[0].id;await c.query('insert into business_memberships(business_id,user_id) values($1,$2)',[b,alice]);return b});
 await assert.rejects(transaction(bob,c=>authorize(c,business)),/access denied/);
 const p=await transaction(alice,async c=>(await c.query("insert into products(business_id,name,selling_price,cost_price,stock_quantity) values($1,'Oil',2500,2000,10) returning id",[business])).rows[0].id);
 assert.equal(await transaction(bob,async c=>(await c.query('select * from products')).rowCount),0);
 const input={items:[{product_id:p,quantity:3,unit_price:'2500'}],payment_status:'paid',source:'manual',idempotency_key:'00000000-0000-4000-8000-000000000004'};
 const result=await transaction(alice,c=>createSale(c,business,alice,input));assert.equal(result.total,'7500.00');
 assert.equal(await transaction(alice,async c=>(await c.query('select stock_quantity from products where id=$1',[p])).rows[0].stock_quantity),7);
 await transaction(alice,c=>createSale(c,business,alice,input));
 assert.equal(await transaction(alice,async c=>(await c.query('select stock_quantity from products where id=$1',[p])).rows[0].stock_quantity),7);
 const race=await Promise.allSettled([5,5].map((qty,i)=>transaction(alice,c=>createSale(c,business,alice,{...input,items:[{product_id:p,quantity:qty,unit_price:'0.10'}],idempotency_key:`00000000-0000-4000-8000-00000000000${5+i}`}))));assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(race.filter(r=>r.status==='rejected').length,1);
 const precision=race.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<any>;assert.equal(precision.value.total,'0.50');
 await assert.rejects(transaction(alice,async c=>{await createSale(c,business,alice,{...input,items:[{product_id:p,quantity:1,unit_price:'2500'}],idempotency_key:'00000000-0000-4000-8000-000000000009'});throw new Error('force rollback')}),/force rollback/);
 assert.equal(await transaction(alice,async c=>(await c.query('select stock_quantity from products where id=$1',[p])).rows[0].stock_quantity),2);
 await transaction(alice,c=>reverseSale(c,business,alice,result.id,'Correction'));assert.equal(await transaction(alice,async c=>(await c.query('select stock_quantity from products where id=$1',[p])).rows[0].stock_quantity),5);
 await transaction(alice,c=>reverseSale(c,business,alice,result.id,'Retry'));assert.equal(await transaction(alice,async c=>(await c.query('select stock_quantity from products where id=$1',[p])).rows[0].stock_quantity),5);
 await db.query('begin');await db.query('set local role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[alice]);await assert.rejects(db.query("insert into products(business_id,name,selling_price) values($1,'Unauthorized',1)",[business]));await db.query('rollback');
 }finally{db.release();await pool.end();}
});
