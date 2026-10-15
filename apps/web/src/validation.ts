import {validationFields} from '@beta/shared';
import type {VoiceLocale,ValidationWorkflow} from '@beta/shared';
import {audioValidationContext,latestValidationContext,clearValidationContexts} from './validation-context';
import type {ValidationContext} from './validation-context';
type ClientEvent='VOICE_STARTED'|'VOICE_PAUSED'|'VOICE_RESUMED'|'VOICE_CANCELLED'|'VOICE_SUBMITTED'|'TRANSCRIPT_RETRY'|'TRANSCRIPT_EDITED'|'RESULT_CONFIRMED';
type Metadata={phase?:'recording'|'review'|'onboarding'|'processing';input_method?:'voice'|'manual'};
let owner:string|null=null,token='',language:VoiceLocale='en',enabled=true,sending=false;
let queue:Record<string,unknown>[]=[];let timer:ReturnType<typeof setTimeout>|undefined;
const base=()=>import.meta.env.VITE_API_BASE_URL??'/api';
export function configureValidation(user:string|null,accessToken:string,locale:VoiceLocale){if(owner!==user){queue=[];clearValidationContexts();enabled=true;}owner=user;token=accessToken;language=locale;}
async function send(path:string,body:unknown,keepalive=false){return fetch(`${base()}/validation/${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body),keepalive});}
export async function startValidationSession(){if(!owner||!token)return;try{const response=await send('session',{language});if(response.ok){const result=await response.json();if(result.data?.enabled===false){enabled=false;queue=[];}}}catch{/* Tracking never blocks the trader. */}}
export async function flushValidation(keepalive=false){if(sending||!enabled||!owner||!token||!queue.length)return;const user=owner,batch=queue.splice(0,30);sending=true;try{const response=await send('events',{events:batch},keepalive);if(!response.ok&&response.status!==400&&owner===user)queue=[...batch,...queue].slice(-300);}catch{if(owner===user)queue=[...batch,...queue].slice(-300);}finally{sending=false;if(queue.length&&!keepalive)schedule(5000);}}
function schedule(delay=250){if(timer)clearTimeout(timer);timer=setTimeout(()=>{timer=undefined;void flushValidation();},delay);}
export function validationEvent(event_type:ClientEvent,context=latestValidationContext(),options:{edited_field?:string;was_edited?:boolean;metadata?:Metadata}={}){if(!owner||!enabled||!context)return;const field=options.edited_field;queue.push({id:crypto.randomUUID(),interaction_id:context.id,event_type,workflow:context.workflow,language,retry_count:context.retry_count,was_edited:options.was_edited??false,...(field?{edited_field:validationFields.includes(field as typeof validationFields[number])?field:'other'}:{}),observed_at:new Date().toISOString(),metadata:options.metadata??{}});queue=queue.slice(-300);schedule();}
export function validationEdited(field:string,context=latestValidationContext()){if(!context||context.edited.has(field))return;context.edited.add(field);validationEvent('TRANSCRIPT_EDITED',context,{edited_field:field,was_edited:true,metadata:{phase:'review'}});}
export function prepareValidationAudio(form:FormData,blob:Blob){const context=audioValidationContext(form,blob);if(context.submissions>1)validationEvent('TRANSCRIPT_RETRY',context,{metadata:{phase:'processing'}});if(!context.submitted){context.submitted=true;validationEvent('VOICE_SUBMITTED',context,{metadata:{phase:'processing',input_method:'voice'}});}return context;}
export function validationConfirmed(){validationEvent('RESULT_CONFIRMED',undefined,{metadata:{phase:'review'}});}
export function finishValidationSession(){if(!owner||!token)return;void flushValidation(true);void send('heartbeat',{closing:true},true).catch(()=>{});}
export function validationHeartbeat(){if(owner&&token)void send('heartbeat',{closing:false}).catch(()=>{});}
export type {ValidationContext,ValidationWorkflow};
