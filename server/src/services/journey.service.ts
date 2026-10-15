import {z} from 'zod';
import type {PoolClient} from 'pg';
import {journeySteps} from '@beta/shared';
import type {Journey,JourneyState,JourneyStep} from '@beta/shared';
import {AppError} from '../db.js';
const stateSchema=z.object({completed:z.array(z.enum(journeySteps)).default([]),skipped:z.array(z.enum(journeySteps)).default([]),known:z.array(z.enum(journeySteps)).default([]),paused:z.boolean().default(false),visits:z.number().int().min(0).default(0),dismissed:z.array(z.string()).max(20).default([])});
const empty=()=>stateSchema.parse({});
const nextStep=(state:JourneyState)=>journeySteps.find(step=>![...state.completed,...state.skipped,...state.known].includes(step))??null;
async function stored(db:PoolClient,b:string,u:string):Promise<JourneyState>{const row=(await db.query("select details from activity_events where business_id=$1 and created_by=$2 and action='guided_journey_v1' order by created_at desc,id desc limit 1",[b,u])).rows[0];return row?stateSchema.parse(row.details):empty();}
async function persist(db:PoolClient,b:string,u:string,state:JourneyState){await db.query("insert into activity_events(business_id,created_by,action,entity_id,details,created_at) values($1,$2,'guided_journey_v1',$1,$3,clock_timestamp())",[b,u,JSON.stringify(state)]);}
async function hydrate(db:PoolClient,b:string,state:JourneyState){const facts=(await db.query('select exists(select 1 from products where business_id=$1) product,exists(select 1 from sales where business_id=$1 and reversed_at is null) sale,exists(select 1 from expenses where business_id=$1) expense,exists(select 1 from debts where business_id=$1) debt',[b])).rows[0];for(const step of journeySteps)if(facts[step]&&!state.completed.includes(step))state.completed.push(step);return state;}
export async function updateJourney(db:PoolClient,b:string,u:string,change:(state:JourneyState)=>void){await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[`journey:${b}:${u}`]);const state=await stored(db,b,u);const before=JSON.stringify(state);await hydrate(db,b,state);change(state);if(JSON.stringify(state)!==before)await persist(db,b,u,state);return state;}
export async function journeySaved(db:PoolClient,b:string,u:string,step:JourneyStep){await updateJourney(db,b,u,state=>{if(!state.completed.includes(step))state.completed.push(step);});}
export const journeyChange=z.discriminatedUnion('action',[
 z.object({action:z.literal('visit')}),z.object({action:z.enum(['skip','known','summary']),step:z.enum(journeySteps)}),z.object({action:z.enum(['pause','resume'])}),z.object({action:z.literal('dismiss'),recommendation_id:z.string().min(1).max(180)}),
]);
export async function changeJourney(db:PoolClient,b:string,u:string,input:unknown){const change=journeyChange.parse(input);return updateJourney(db,b,u,state=>{
 if(change.action==='visit')state.visits++;
 else if(change.action==='pause'||change.action==='resume')state.paused=change.action==='pause';
 else if(change.action==='dismiss')state.dismissed=[...state.dismissed.filter(x=>x!==change.recommendation_id),change.recommendation_id].slice(-20);
 else if('step' in change){if(nextStep(state)!==change.step)throw new AppError(409,'Your guide has changed. Refresh and continue.');if(change.action==='summary'&&change.step!=='summary')throw new AppError(400,'View the summary after the earlier steps.');const field=change.action==='summary'?'completed':change.action==='skip'?'skipped':'known';state[field].push(change.step);}
 });}
export async function getJourney(db:PoolClient,b:string,u:string):Promise<Journey>{
 const state=await hydrate(db,b,await stored(db,b,u));
 // Existing traders can continue from their real records without repeating work.
 const step=nextStep(state);
 let recommendation:Journey['recommendation']=null;
 if(!step&&!state.paused){
  const facts=(await db.query(`select (now() at time zone 'Africa/Lagos')::date::text as today_key,coalesce((select sum(total) from sales where business_id=$1 and reversed_at is null and (created_at at time zone 'Africa/Lagos')::date=(now() at time zone 'Africa/Lagos')::date),0)::text amount,(select count(*)::int from expenses where business_id=$1 and occurred_on=(now() at time zone 'Africa/Lagos')::date) expenses`,[b])).rows[0];
  const expenseId=`expense:${facts.today_key}`;
  if(Number(facts.amount)>0&&facts.expenses===0&&!state.dismissed.includes(expenseId))recommendation={id:expenseId,kind:'expense',amount:facts.amount};
  else {const products=(await db.query('select id,name,stock_quantity,updated_at from products where business_id=$1 and not archived and stock_quantity<=low_stock_threshold order by stock_quantity,id limit 20',[b])).rows;const product=products.find(p=>!state.dismissed.includes(`stock:${p.id}:${new Date(p.updated_at).toISOString()}`));if(product)recommendation={id:`stock:${product.id}:${new Date(product.updated_at).toISOString()}`,kind:'stock',product:product.name,quantity:product.stock_quantity};}
 }
 return {state,step,recommendation};
}
