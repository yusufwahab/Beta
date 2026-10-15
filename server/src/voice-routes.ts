import {Router} from 'express';
import type multer from 'multer';
import rateLimit from 'express-rate-limit';
import {z} from 'zod';
import {languages,voiceText,voiceReview,money} from '@beta/shared';
import type {PoolClient} from 'pg';
import type {VoiceMessage} from '@beta/shared';
import {transaction,authorize,AppError} from './db.js';
import {transcribe} from './services/natlas.service.js';
import {commandTurn} from './services/intent.service.js';
import {synthesize} from './services/tts.service.js';
import {normalize} from './services/intent.service.js';
import type {Command} from './services/intent.service.js';
import {validateVoiceAction} from './services/voice-action.js';
export type VoiceAction={path:string;params:Record<string,string>;body:Record<string,unknown>};
type Execute=(db:PoolClient,b:string,u:string,action:VoiceAction,preview?:boolean)=>Promise<unknown>;

function queryWindow(period:string|undefined){
 const today="(now() at time zone 'Africa/Lagos')::date";
 const week="date_trunc('week',now() at time zone 'Africa/Lagos')::date";
 const month="date_trunc('month',now() at time zone 'Africa/Lagos')::date";
 const windows:Record<string,[string,string]>={today:[today,today],yesterday:[`${today}-1`,`${today}-1`],week:[week,today],month:[month,today],last_week:[`${week}-7`,`${week}-1`],last_month:[`(${month}-interval '1 month')::date`,`${month}-1`]};
 return windows[period??'today']??windows.today;
}
const pending=new Map<string,{id:string;expires:number;action:VoiceAction;command:Command;response:string;result?:unknown}>();

export function voiceRoutes(upload:multer.Multer,execute:Execute){const router=Router();
 router.post('/voice/onboarding/transcribe',rateLimit({windowMs:60000,limit:8}),upload.single('audio'),async(req,res)=>{if(!req.file)throw new AppError(400,'Record an answer first');try{res.json({data:await transcribe(req.file.buffer,req.file.mimetype,z.enum(languages).parse(req.body.language))});}finally{req.file.buffer.fill(0);}});
 router.post('/voice/speak',rateLimit({windowMs:60000,limit:12}),async(req,res)=>{const audio=await synthesize(req.body);res.set({'Content-Type':'audio/mpeg','Cache-Control':'no-store'}).send(audio);});
 router.post('/businesses/:business/voice/cancel',async(req,res)=>{const b=z.uuid().parse(req.params.business);const user=res.locals.user.id;await transaction(user,db=>authorize(db,b));pending.delete(`${user}:${b}`);commandTurn(`${user}:${b}`,'cancel',[]);res.json({data:{cancelled:true}});});
 router.post('/businesses/:business/voice/confirm',async(req,res)=>{const b=z.uuid().parse(req.params.business);const user=res.locals.user.id;const body=z.object({confirmation_id:z.uuid(),confirmed:z.literal(true)}).parse(req.body);const draft=pending.get(`${user}:${b}`);if(!draft||draft.expires<Date.now()||draft.id!==body.confirmation_id)throw new AppError(409,'This draft expired or was replaced. Please record again.');const result=await transaction(user,async db=>{await authorize(db,b);if(draft.result!==undefined)return draft.result;return execute(db,b,user,draft.action)});draft.result=result;res.json({data:result});});
 router.post('/businesses/:business/voice/command',rateLimit({windowMs:60000,limit:15}),async(req,res)=>{const b=z.uuid().parse(req.params.business);const user=res.locals.user.id;const scope=`${user}:${b}`;const {voice_interaction_id}=z.object({voice_interaction_id:z.uuid()}).parse(req.body);const result=await transaction(user,async db=>{await authorize(db,b);const voice=(await db.query('select * from voice_interactions where business_id=$1 and id=$2',[b,voice_interaction_id])).rows[0];if(!voice)throw new AppError(404,'Recording not found');const products=(await db.query('select id,name,selling_price,stock_quantity from products where business_id=$1 and not archived',[b])).rows;const command=commandTurn(scope,voice.transcript,products);if(command.intent==='CONFIRM'){const draft=pending.get(scope);if(draft&&draft.expires>Date.now()){if(draft.result!==undefined)return {command,response:voiceText(z.enum(languages).parse(voice.language),'saved'),language:voice.language};return {command:draft.command,response:draft.response,language:voice.language,confirmation_id:draft.id,preview:await execute(db,b,user,draft.action,true)};}}pending.delete(scope);const language=z.enum(languages).parse(voice.language);let response=voiceText(language,command.clarification as VoiceMessage||'review');let destination:string|undefined;let confirmation_id:string|undefined;let preview:unknown;const [rangeStart,rangeEnd]=queryWindow(command.entities.period);
 if(command.missing.length)response=voiceText(language,command.missing[0] as VoiceMessage);
 else if(command.intent==='HELP')response=voiceText(language,'help');
 else if(command.intent==='CANCEL')response=voiceText(language,'cancel');
 else if(command.intent==='CONFIRM')response=voiceText(language,'review');
 else if(['GET_TODAY_SALES','GET_PERIOD_SALES'].includes(command.intent)){const {amount}=(await db.query(`select coalesce(sum(total),0)::text amount from sales where business_id=$1 and reversed_at is null and (created_at at time zone 'Africa/Lagos')::date between ${rangeStart} and ${rangeEnd}`,[b])).rows[0];response=voiceText(language,command.intent==='GET_TODAY_SALES'?'today':'period',{amount});}
 else if(command.intent==='CHECK_STOCK'){const product=products.find(p=>p.name===command.entities.product);response=voiceText(language,'stockResult',{product:product.name,quantity:product.stock_quantity});}
 else if(command.intent==='GET_EXPENSES'){const {amount}=(await db.query(`select coalesce(sum(amount),0)::text amount from expenses where business_id=$1 and occurred_on between ${rangeStart} and ${rangeEnd}`,[b])).rows[0];response=voiceText(language,'expenses',{amount});}
 else if(['CHECK_DEBT','LIST_DEBTORS'].includes(command.intent)){destination='/app/debts';const {amount}=(await db.query('select coalesce(sum(d.amount-coalesce((select sum(amount) from debt_repayments where debt_id=d.id),0)),0)::text amount from debts d left join sales s on s.id=d.sale_id where d.business_id=$1 and s.reversed_at is null',[b])).rows[0];response=voiceText(language,'debtResult',{amount});}
 else if(command.intent==='GET_PROFIT_SUMMARY'){const row=(await db.query(`select case when count(*)=0 or count(*) filter(where i.cost_price is null)>0 then null else sum(i.line_total-i.quantity*i.cost_price)-(select coalesce(sum(amount),0) from expenses where business_id=$1 and occurred_on between ${rangeStart} and ${rangeEnd}) end::text amount from sale_items i join sales s on s.id=i.sale_id where s.business_id=$1 and s.reversed_at is null and (s.created_at at time zone 'Africa/Lagos')::date between ${rangeStart} and ${rangeEnd}`,[b])).rows[0];response=voiceText(language,'profit',{amount:row.amount??'—'});}
 else{destination=({RECORD_SALE:'/app/checkout',RECORD_EXPENSE:'/app/expenses',ADD_STOCK:'/app/inventory',RECORD_DEBT:'/app/debts',RECORD_DEBT_PAYMENT:'/app/debts'} as Record<string,string>)[command.intent];response=voiceText(language,'review');}
 if(!command.missing.length&&command.confidence>=0.85&&['RECORD_SALE','RECORD_EXPENSE','ADD_STOCK','RECORD_DEBT','RECORD_DEBT_PAYMENT'].includes(command.intent)){
  const e=command.entities;const product=products.find(p=>p.name===e.product);const body:Record<string,unknown>={idempotency_key:crypto.randomUUID()};let action:VoiceAction|undefined;
  if(command.intent==='RECORD_SALE'&&product)action={path:'/sales',params:{},body:{...body,items:[{product_id:product.id,quantity:e.quantity,unit_price:money.parse(e.unit_price)}],payment_status:'unknown',source:'voice',voice_interaction_id}};
  if(command.intent==='RECORD_EXPENSE')action={path:'/expenses',params:{},body:{...body,amount:money.parse(e.amount),category:e.category,description:'Voice expense',occurred_on:new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}};
  if(command.intent==='ADD_STOCK'&&product)action={path:'/products/:id/stock',params:{id:product.id},body:{...body,quantity:e.quantity,reason:'Voice restock'}};
  if(['RECORD_DEBT','RECORD_DEBT_PAYMENT'].includes(command.intent)){const customers=(await db.query('select id,name from customers where business_id=$1',[b])).rows.filter(c=>normalize(c.name)===normalize(e.customer??''));if(customers.length===1){const customer=customers[0];if(command.intent==='RECORD_DEBT')action={path:'/debts',params:{},body:{...body,customer_id:customer.id,amount:money.parse(e.amount),description:'Voice debt'}};else{const debts=(await db.query('select d.id from debts d left join sales s on s.id=d.sale_id where d.business_id=$1 and d.customer_id=$2 and s.reversed_at is null and d.amount>coalesce((select sum(amount) from debt_repayments where debt_id=d.id),0)',[b,customer.id])).rows;if(debts.length===1)action={path:'/debts/:id/repayments',params:{id:debts[0].id},body:{...body,amount:money.parse(e.amount)}};}}if(!action){command.confidence=0.4;response=voiceText(language,'customer');}}
  if(action){action.body=validateVoiceAction(action.path,action.body) as Record<string,unknown>;for(const value of Object.values(action.params))z.uuid().parse(value);confirmation_id=crypto.randomUUID();preview=await execute(db,b,user,action,true);response=voiceReview(language,command.intent,{...command.entities,total:(preview as {total?:string}).total??''});if(pending.size>=2000)pending.delete(pending.keys().next().value!);pending.set(scope,{id:confirmation_id,expires:Date.now()+300000,action,command,response});destination=undefined;}
 }
 return {command,response,language,destination,voice_interaction_id,confirmation_id,preview};});res.json({data:result});});
 return router;}
