import {z} from 'zod';

export class EmailDeliveryError extends Error {
 constructor(public status:number,message:string){super(message);}
}
const configSchema=z.object({
 BREVO_API_KEY:z.string().trim().min(1),
 BREVO_SENDER_EMAIL:z.email(),
 BREVO_SENDER_NAME:z.string().trim().min(1).default('Beta'),
});
export function emailConfig(env:NodeJS.ProcessEnv=process.env){
 const result=configSchema.safeParse(env);
 if(!result.success)throw new EmailDeliveryError(503,'Email verification is temporarily unavailable. Please try again later.');
 return result.data;
}
export function emailStatus(){
 try{emailConfig();return {provider:'brevo-api',mode:'direct',configured:true};}
 catch{return {provider:'brevo-api',mode:'direct',configured:false};}
}
function escapeHtml(value:string){return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));}
function renderEmail(subject:string,description:string,code?:string,link?:string){
 const content=code?'<p style="font-size:32px;font-weight:bold;letter-spacing:6px;padding:16px;background:#f4f5f8;border-radius:8px;text-align:center;">'+escapeHtml(code)+'</p>':link?'<p><a href="'+escapeHtml(link)+'" style="display:inline-block;padding:14px 24px;border-radius:8px;background:#5145f5;color:#ffffff;text-decoration:none;font-weight:bold;">Reset my password</a></p><p style="font-size:14px;word-break:break-all;">You can also copy this link into your browser:<br>'+escapeHtml(link)+'</p>':'';
 return {
  subject,
  textContent:subject+'\n\n'+description+'\n\n'+(code??link??'')+'\n\nIf you did not request this, you can ignore this email.',
  htmlContent:'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>'+escapeHtml(subject)+'</title></head><body style="margin:0;padding:32px 16px;background:#f4f5f8;font-family:Arial,sans-serif;color:#101722;"><div style="max-width:560px;margin:auto;padding:32px;background:#ffffff;border-radius:16px;"><p style="font-size:32px;font-weight:bold;">beta<span style="color:#00a3a8;">.</span></p><h1 style="font-size:26px;">'+escapeHtml(subject)+'</h1><p style="line-height:1.6;">'+escapeHtml(description)+'</p>'+content+'<p style="font-size:13px;color:#596579;">If you did not request this, you can ignore this email.</p></div></body></html>',
 };
}
async function sendMessage(email:string,message:ReturnType<typeof renderEmail>,config:ReturnType<typeof emailConfig>,request:typeof fetch){
 try{
  const response=await request('https://api.brevo.com/v3/smtp/email',{
   method:'POST',headers:{'api-key':config.BREVO_API_KEY,'Content-Type':'application/json',Accept:'application/json'},
   body:JSON.stringify({sender:{email:config.BREVO_SENDER_EMAIL,name:config.BREVO_SENDER_NAME},to:[{email}],...message}),
   signal:AbortSignal.timeout(10000),
  });
  const data=await response.json() as {code?:unknown;messageId?:unknown};
  if(!response.ok){
   const code=typeof data.code==='string'&&/^[a-z_]{1,80}$/.test(data.code)?data.code:'unknown';
   console.error('Brevo email request rejected',{status:response.status,code});
   throw new EmailDeliveryError(502,'Unable to send your email. Please try again shortly.');
  }
  if(typeof data.messageId!=='string'||!data.messageId)throw new Error('Missing delivery acceptance');
  console.info('Brevo accepted an authentication email');
 }catch(error){
  if(error instanceof EmailDeliveryError)throw error;
  console.error('Brevo email request failed',{reason:'network_or_invalid_response'});
  throw new EmailDeliveryError(502,'Unable to send your email. Please try again shortly.');
 }
}
export async function sendVerificationCode(email:string,code:string,config:ReturnType<typeof emailConfig>,request:typeof fetch=fetch){
 if(!/^\d{6,10}$/.test(code))throw new EmailDeliveryError(502,'Unable to create your verification code. Please try again.');
 await sendMessage(email,renderEmail('Your Beta verification code','Enter this code in Beta to confirm your email and finish creating your account.',code),config,request);
}
export async function sendPasswordRecovery(email:string,link:string,config:ReturnType<typeof emailConfig>,request:typeof fetch=fetch){
 if(!z.url().safeParse(link).success||!['http:','https:'].includes(new URL(link).protocol))throw new EmailDeliveryError(502,'Unable to create your password recovery email. Please try again.');
 await sendMessage(email,renderEmail('Reset your Beta password','Follow this link to choose a new password for your Beta account.',undefined,link),config,request);
}
