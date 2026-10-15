import express from 'express';
import rateLimit from 'express-rate-limit';
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import type {SupabaseClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {EmailDeliveryError,emailConfig,sendVerificationCode,sendPasswordRecovery} from './services/email.service.js';

type AuthAdmin=Pick<SupabaseClient['auth']['admin'],'generateLink'>;
const emailSchema=z.string().trim().pipe(z.email()).transform(email=>email.toLowerCase());
const signupSchema=z.object({full_name:z.string().trim().min(1,'Enter your name.').max(200),email:emailSchema,password:z.string().min(8,'Use at least 8 characters').max(256)});
const addressSchema=z.object({email:emailSchema});

export function authEmailRoutes(env:NodeJS.ProcessEnv=process.env,request:typeof fetch=fetch,injectedAdmin?:AuthAdmin){
 const router=express.Router();
 const requestLimit=rateLimit({windowMs:15*60000,limit:20,standardHeaders:'draft-8',legacyHeaders:false,message:{error:{message:'Too many requests. Please try again later.'}}});
 const recipientLimit=rateLimit({windowMs:60000,limit:1,standardHeaders:'draft-8',legacyHeaders:false,
  skip:req=>!(req.path.endsWith('/signup')?signupSchema:addressSchema).safeParse(req.body).success,
  keyGenerator:req=>createHash('sha256').update(addressSchema.parse(req.body).email).digest('hex'),
  message:{error:{message:'Please wait one minute before requesting another email.'}},
 });
 // Signup, resend and recovery all count towards the same per-address cooldown.
 router.use('/api/auth',requestLimit);
 let admin:AuthAdmin|undefined=injectedAdmin;
 function configuredAdmin(){
  if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw new EmailDeliveryError(503,'Account registration is temporarily unavailable.');
  admin??=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{
   auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
   global:{fetch:(url,init)=>request(url,{...init,signal:AbortSignal.timeout(10000)})},
  }).auth.admin;
  return admin;
 }
 function failure(res:express.Response,error:unknown){
  if(error instanceof z.ZodError){res.status(400).json({error:{message:error.issues.map(issue=>issue.message).join('; ')}});return;}
  const status=error instanceof EmailDeliveryError?error.status:502;
  res.status(status).json({error:{message:error instanceof EmailDeliveryError?error.message:'Unable to complete this request. Please try again.'}});
 }
 router.post('/api/auth/signup',recipientLimit,async(req,res)=>{
  try{
   const values=signupSchema.parse(req.body);const config=emailConfig(env);
   const {data,error}=await configuredAdmin().generateLink({type:'signup',email:values.email,password:values.password,options:{data:{full_name:values.full_name}}});
   if(error||!data.user||!data.properties)throw new EmailDeliveryError(400,'Unable to create this account. If you already registered, try signing in to continue verification.');
   if(data.user.email_confirmed_at)throw new EmailDeliveryError(400,'Please sign in to your existing account.');
   let emailSent=true;let deliveryError:string|undefined;
   try{await sendVerificationCode(values.email,data.properties.email_otp,config,request);}
   catch(error){
    // The account exists even when delivery fails: preserve a path to resend, never claim success.
    emailSent=false;deliveryError=error instanceof EmailDeliveryError?error.message:'Unable to send your verification code. Please try resending it.';
   }
   res.status(201).json({data:{email:values.email,emailSent,deliveryError,retryAfter:60}});
  }catch(error){failure(res,error);}
 });
 router.post('/api/auth/resend',recipientLimit,async(req,res)=>{
  try{
   const {email}=addressSchema.parse(req.body);const config=emailConfig(env);
   // Recovery generation never creates accounts. Its OTP can be verified with type=email,
   // which Supabase maps to the recovery/magic-link token and confirms unconfirmed users.
   const {data,error}=await configuredAdmin().generateLink({type:'recovery',email});
   if(error){
    if(error.code==='user_not_found'||error.status===404){res.json({data:{requested:true,retryAfter:60}});return;}
    throw new EmailDeliveryError(502,'Unable to request a verification code. Please try again.');
   }
   // Do not turn signup verification into passwordless login for already verified accounts.
   if(data.user&&!data.user.email_confirmed_at&&data.properties)await sendVerificationCode(email,data.properties.email_otp,config,request);
   res.json({data:{requested:true,retryAfter:60}});
  }catch(error){failure(res,error);}
 });
 router.post('/api/auth/recover',recipientLimit,async(req,res)=>{
  try{
   const {email}=addressSchema.parse(req.body);const config=emailConfig(env);
   const allowed=(env.FRONTEND_URL??'http://localhost:5173').split(',').map(url=>new URL(url.trim()).origin);
   const redirect=new URL(z.url().parse(req.body.redirectTo));
   if(!allowed.includes(redirect.origin)||redirect.pathname!=='/auth'||redirect.search!=='?mode=update')throw new EmailDeliveryError(400,'Invalid password recovery destination.');
   const {data,error}=await configuredAdmin().generateLink({type:'recovery',email,options:{redirectTo:redirect.href}});
   if(error){
    if(error.code==='user_not_found'||error.status===404){res.json({data:{requested:true}});return;}
    throw new EmailDeliveryError(502,'Unable to request password recovery. Please try again.');
   }
   if(data.user&&data.properties)await sendPasswordRecovery(email,data.properties.action_link,config,request);
   res.json({data:{requested:true}});
  }catch(error){failure(res,error);}
 });
 return router;
}
