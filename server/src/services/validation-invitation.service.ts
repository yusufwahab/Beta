import {createHash,randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import type {PoolClient} from 'pg';
import {transaction,AppError} from '../db.js';
import {ensureSession,validationMode} from './validation.service.js';
import {emailConfig,sendValidationInvitation} from './email.service.js';
import {maskEmail} from './validation-import.service.js';
import type {Contact} from './validation-import.service.js';
export const invitationAdmin=<T>(user:string,fn:(db:PoolClient)=>Promise<T>)=>transaction(user,async db=>{await db.query("select set_config('beta.validation_admin','true',true)");return fn(db);});
const systemUser='00000000-0000-0000-0000-000000000000';
export const tokenHash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function invitationOrigin(){const raw=process.env.VALIDATION_INVITE_BASE_URL?.trim()||process.env.FRONTEND_URL?.split(',')[0]?.trim()||'';let url:URL;try{url=new URL(raw);}catch{throw new AppError(503,'Configure VALIDATION_INVITE_BASE_URL before sending invitations');}if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw new AppError(503,'Use an HTTPS frontend origin for invitation links');return url.origin;}
export async function importContacts(db:PoolClient,contacts:Contact[],mode:string,commit:boolean,user:string){
 const existing=(await db.query('select email,invited_at,testing_completed_at from validation_invitations where mode=$1 and email=any($2::text[])',[mode,contacts.map(row=>row.email)])).rows;
 const byEmail=new Map(existing.map(row=>[row.email,row]));let imported=0;
 for(const row of contacts){if(row.status!=='ready')continue;const old=byEmail.get(row.email);if(old){row.status=old.testing_completed_at?'already_completed':old.invited_at?'already_invited':'already_imported';continue;}if(commit){const result=await db.query('insert into validation_invitations(mode,name,email,phone,reference_id,created_by) values($1,$2,$3,$4,$5,$6) on conflict(mode,email) do nothing',[mode,row.name,row.email,row.phone,row.reference_id,user]);if(result.rowCount){imported++;row.status='imported';}else row.status='already_imported';}}
 return {rows:contacts,imported,ready:contacts.filter(row=>row.status==='ready').length};
}
export async function sendInvitation(user:string,id:string,mode:string,resend:boolean){
 const config=emailConfig(),origin=invitationOrigin(),token=randomBytes(32).toString('base64url'),hash=tokenHash(token);
 const row=await invitationAdmin(user,async db=>{
  const row=(await db.query('select * from validation_invitations where id=$1 and mode=$2 for update',[id,mode])).rows[0];
  if(!row)throw new AppError(404,'Invitation not found');
  if(row.revoked_at||row.testing_completed_at)throw new AppError(409,'This invitation is revoked or testing is complete');
  if(row.delivery_status==='sent'&&!resend)throw new AppError(409,'Already invited; choose resend explicitly');
  if(row.last_attempt_at&&Date.now()-new Date(row.last_attempt_at).getTime()<(row.delivery_status==='sending'?300000:60000))throw new AppError(429,'Please wait before sending this invitation again');
  await db.query("update validation_invitations set delivery_status='sending',last_attempt_at=clock_timestamp(),send_attempts=send_attempts+1,delivery_error=null,token_hash=$2,expires_at=clock_timestamp()+interval '7 days',used_at=null where id=$1",[id,hash]);return row;
 });
 try{
  const messageId=await sendValidationInvitation(row.email,`${origin}/test/invite#token=${token}`,config);
  await invitationAdmin(user,db=>db.query("update validation_invitations set delivery_status='sent',provider_message_id=$3,invited_at=coalesce(invited_at,clock_timestamp()) where id=$1 and token_hash=$2",[id,hash,messageId]));
  return {id,status:'sent'};
 }catch{
  await invitationAdmin(user,db=>db.query("update validation_invitations set delivery_status='failed',delivery_error='delivery_failed',token_hash=null where id=$1 and token_hash=$2",[id,hash]));return {id,status:'failed'};
 }
}
export async function inspectInvitation(token:string){return invitationAdmin(systemUser,async db=>{const row=(await db.query("update validation_invitations set invite_opened_at=coalesce(invite_opened_at,clock_timestamp()) where token_hash=$1 and invited_at is not null and delivery_status='sent' and expires_at>clock_timestamp() and used_at is null and revoked_at is null returning email,mode",[tokenHash(token)])).rows[0];if(!row)throw new AppError(410,'This invitation is expired, used or unavailable. Ask the Beta team for a new link.');return {email:maskEmail(row.email),mode:row.mode};});}
export async function acceptInvitation(token:string,ua:string){
 if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new AppError(503,'Invitation sign-in is temporarily unavailable');
 return invitationAdmin(systemUser,async db=>{
  await db.query("set local lock_timeout='3s'");
  const row=(await db.query("select * from validation_invitations where token_hash=$1 and delivery_status='sent' and invited_at is not null and expires_at>clock_timestamp() and used_at is null and revoked_at is null for update",[tokenHash(token)])).rows[0];
  if(!row)throw new AppError(410,'This invitation is expired, used or unavailable. Ask the Beta team for a new link.');
  if(row.mode!==validationMode())throw new AppError(503,'This invitation belongs to a different testing environment. Contact the Beta team.');
  const auth=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(10000)})}});
  const generated=await auth.auth.admin.generateLink({type:'magiclink',email:row.email});
  if(generated.error||!generated.data.properties||!generated.data.user)throw new AppError(502,'Unable to sign in with this invitation. Please retry.');
  if(generated.data.user.app_metadata?.beta_validation_admin===true)throw new AppError(403,'Team accounts cannot participate through testing invitations');
  const verified=await auth.auth.verifyOtp({token_hash:generated.data.properties.hashed_token,type:'email'});
  const session=verified.data.session,user=verified.data.user;
  if(verified.error||!session||!user||user.is_anonymous||!user.email_confirmed_at||user.email?.toLowerCase()!==row.email)throw new AppError(502,'Unable to verify this invitation. Please retry.');
  const validation=await ensureSession(db,user.id,undefined,ua,row.participant_id);
  if(!validation)throw new AppError(503,'Validation testing is currently disabled');
  await db.query("update validation_invitations set supabase_user_id=$2,validation_session_id=$3,participant_id=$4,used_at=clock_timestamp(),accepted_at=coalesce(accepted_at,clock_timestamp()),consent_at=clock_timestamp(),consent_version='validation-invite-v1' where id=$1",[row.id,user.id,validation.id,validation.participant_id]);
  return {access_token:session.access_token,refresh_token:session.refresh_token,participant_id:validation.participant_id};
 });
}
export async function invitationReport(db:PoolClient,mode:string){
 return (await db.query(`select i.id,i.participant_id,i.name,i.email,i.phone,i.reference_id,i.delivery_status,i.delivery_error,i.send_attempts,i.invited_at,i.invite_opened_at,i.accepted_at,i.testing_started_at,i.testing_completed_at,i.expires_at,i.revoked_at,i.validation_session_id,s.language,s.excluded,
 count(e.id) filter(where e.source='server' and e.event_type='NATLAS_PROCESSING_STARTED')::int voice_attempts,
 count(e.id) filter(where e.source='server' and e.event_type='NATLAS_SUCCESS')::int natlas_success,
 count(e.id) filter(where e.source='server' and e.event_type='NATLAS_FAILED')::int natlas_failed,
 count(distinct e.interaction_id) filter(where e.event_type='TRANSCRIPT_RETRY')::int retries,
 coalesce(bool_or(e.event_type='TRANSCRIPT_EDITED'),false) result_edited,
 string_agg(distinct e.edited_field,', ') edited_fields,
 string_agg(distinct e.workflow,', ') filter(where e.source='server' and e.event_type='FLOW_COMPLETED' and e.workflow in ('sale','expense','stock','debt','business_summary')) workflows
 from validation_invitations i left join validation_sessions s on s.id=i.validation_session_id left join validation_events e on e.session_id=s.id and e.source<>'legacy' and e.created_at>=i.accepted_at where i.mode=$1 group by i.id,s.language,s.excluded order by i.created_at desc,i.id`,[mode])).rows;
}
