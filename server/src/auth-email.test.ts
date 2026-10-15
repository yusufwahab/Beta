import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {AddressInfo} from 'node:net';
import express from 'express';
import {AuthApiError} from '@supabase/supabase-js';
import type {GenerateLinkParams,SupabaseClient,User} from '@supabase/supabase-js';
import {authEmailRoutes} from './auth-email.js';
import {emailConfig,sendVerificationCode} from './services/email.service.js';

const env={BREVO_API_KEY:'local-brevo-test-key',BREVO_SENDER_EMAIL:'auth@example.com',BREVO_SENDER_NAME:'Beta',SUPABASE_URL:'https://project.example.com',SUPABASE_SERVICE_ROLE_KEY:'local-admin-test-key',FRONTEND_URL:'http://localhost:5173'};
const signup={full_name:'Ada Test',email:'ada@example.com',password:'test-password-only'};
const user:User={id:'00000000-0000-4000-8000-000000000020',email:signup.email,aud:'authenticated',created_at:new Date().toISOString(),app_metadata:{provider:'email'},user_metadata:{full_name:signup.full_name}};
type Delivery={url:string;headers:Headers;body:{sender:{email:string;name:string};to:{email:string}[];subject:string;htmlContent:string;textContent:string}};
type Options={providerStatus?:number;missingUser?:boolean;confirmed?:boolean;settings?:NodeJS.ProcessEnv;generationError?:boolean};

async function withApi(run:(post:(path:string,body:unknown)=>Promise<Response>,generated:GenerateLinkParams[],sent:Delivery[])=>Promise<void>,options:Options={}){
 const generated:GenerateLinkParams[]=[];const sent:Delivery[]=[];
 const admin:Pick<SupabaseClient['auth']['admin'],'generateLink'>={generateLink:async params=>{
  generated.push(params);
  if(options.missingUser||options.generationError)return {data:{user:null,properties:null},error:new AuthApiError('private provider detail',options.missingUser?404:500,options.missingUser?'user_not_found':'unexpected_failure')};
  return {data:{user:{...user,email_confirmed_at:options.confirmed?new Date().toISOString():undefined},properties:{action_link:'https://project.example.com/auth/v1/verify?token=private-hash&type=recovery&redirect_to=http%3A%2F%2Flocalhost%3A5173%2Fauth%3Fmode%3Dupdate',email_otp:'012345',hashed_token:'private-hash',redirect_to:'http://localhost:5173/auth?mode=update',verification_type:params.type}},error:null};
 }};
 const request:typeof fetch=async(url,init)=>{
  sent.push({url:String(url),headers:new Headers(init?.headers),body:JSON.parse(String(init?.body))});
  return new Response(JSON.stringify(options.providerStatus?{code:'permission_denied',message:'private-provider-detail'}:{messageId:'test-accepted-message'}),{status:options.providerStatus??201});
 };
 const app=express();app.use(express.json());app.use(authEmailRoutes(options.settings??env,request,admin));
 app.use('/api',(_req,res)=>res.status(401).json({error:{message:'Sign in'}}));
 const listener=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>listener.once('listening',resolve));
 const base=`http://127.0.0.1:${(listener.address() as AddressInfo).port}/api/auth`;
 const post=(path:string,body:unknown)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{await run(post,generated,sent);}finally{await new Promise<void>((resolve,reject)=>listener.close(error=>error?reject(error):resolve()));}
}

test('local signup collects a name, generates an OTP and sends through Brevo without a hook',async()=>{
 await withApi(async(post,generated,sent)=>{
  const response=await post('/signup',{...signup,email:' Ada@Example.com ',full_name:' Ada Test '});
  assert.equal(response.status,201);const payload=await response.json();
  assert.deepEqual(payload.data,{email:signup.email,emailSent:true,retryAfter:60});
  assert.deepEqual(generated,[{type:'signup',email:signup.email,password:signup.password,options:{data:{full_name:signup.full_name}}}]);
  assert.equal(sent.length,1);assert.equal(sent[0].url,'https://api.brevo.com/v3/smtp/email');
  assert.equal(sent[0].headers.get('api-key'),env.BREVO_API_KEY);
  assert.deepEqual(sent[0].body.sender,{email:env.BREVO_SENDER_EMAIL,name:'Beta'});
  assert.deepEqual(sent[0].body.to,[{email:signup.email}]);
  assert.match(sent[0].body.htmlContent,/012345/);assert.match(sent[0].body.textContent,/012345/);
  assert.doesNotMatch(sent[0].body.htmlContent,/href=|private-hash/);
  assert.doesNotMatch(JSON.stringify(payload),/012345|private-hash|local-admin-test-key|test-password-only/);
 });
});

test('invalid names, passwords and addresses never create an account or send an email',async()=>{
 await withApi(async(post,generated,sent)=>{
  for(const input of [{...signup,full_name:''},{...signup,full_name:'   '},{...signup,password:'short'},{...signup,email:'invalid'}]){
   assert.equal((await post('/signup',input)).status,400);
  }
  assert.equal(generated.length,0);assert.equal(sent.length,0);
 });
});

test('delivery failure is reported while preserving the created account for resend',async()=>{
 await withApi(async(post,_generated,sent)=>{
  const response=await post('/signup',signup);assert.equal(response.status,201);
  const payload=await response.json();assert.equal(payload.data.emailSent,false);
  assert.match(payload.data.deliveryError,/Unable to send/);
  assert.doesNotMatch(JSON.stringify(payload),/private-provider-detail|012345|private-hash/);
  assert.equal(sent.length,1);
 },{providerStatus:403});
});

test('unconfigured delivery rejects signup before creating an account',async()=>{
 await withApi(async(post,generated,sent)=>{
  assert.equal((await post('/signup',signup)).status,503);
  assert.equal(generated.length,0);assert.equal(sent.length,0);
 },{settings:{...env,BREVO_API_KEY:''}});
});

test('Supabase generation errors never claim that an email was sent',async()=>{
 await withApi(async(post,_generated,sent)=>{
  const response=await post('/signup',signup);assert.equal(response.status,400);
  assert.doesNotMatch(await response.text(),/private provider detail/);assert.equal(sent.length,0);
 },{generationError:true});
});

test('resend only generates an existing-account OTP and sends it through Brevo',async()=>{
 await withApi(async(post,generated,sent)=>{
  const response=await post('/resend',{email:signup.email});assert.equal(response.status,200);
  assert.deepEqual(generated,[{type:'recovery',email:signup.email}]);
  assert.equal(sent.length,1);assert.match(sent[0].body.htmlContent,/012345/);
 });
});

test('unknown and already verified addresses receive generic resend responses without email',async()=>{
 for(const options of [{missingUser:true},{confirmed:true}]){
  await withApi(async(post,_generated,sent)=>{
   const response=await post('/resend',{email:signup.email});assert.equal(response.status,200);
   assert.deepEqual(await response.json(),{data:{requested:true,retryAfter:60}});assert.equal(sent.length,0);
  },options);
 }
});

test('resend delivery failures return an error rather than successful delivery',async()=>{
 await withApi(async(post)=>{const response=await post('/resend',{email:signup.email});assert.equal(response.status,502);assert.match(await response.text(),/Unable to send/);},{providerStatus:401});
});

test('signup and resend share the per-recipient cooldown, including address case changes',async()=>{
 await withApi(async(post,generated,sent)=>{
  assert.equal((await post('/signup',signup)).status,201);
  assert.equal((await post('/resend',{email:'ADA@example.com'})).status,429);
  assert.equal(generated.length,1);assert.equal(sent.length,1);
 });
});

test('password recovery sends a backend-generated link with the allowed frontend destination',async()=>{
 await withApi(async(post,generated,sent)=>{
  const redirectTo='http://localhost:5173/auth?mode=update';
  const response=await post('/recover',{email:signup.email,redirectTo});assert.equal(response.status,200);
  assert.deepEqual(generated,[{type:'recovery',email:signup.email,options:{redirectTo}}]);
  assert.equal(sent.length,1);assert.match(sent[0].body.htmlContent,/Reset my password/);
 });
});

test('recovery rejects an arbitrary redirect before generating a token',async()=>{
 await withApi(async(post,generated,sent)=>{
  assert.equal((await post('/recover',{email:signup.email,redirectTo:'https://attacker.example/auth?mode=update'})).status,400);
  assert.equal(generated.length,0);assert.equal(sent.length,0);
 });
});

test('codes are validated as strings, preserving zeroes and rejecting HTML',async()=>{
 let requests=0;const request:typeof fetch=async()=>{requests++;return new Response('{"messageId":"accepted"}',{status:201});};
 await sendVerificationCode(signup.email,'0123456789',emailConfig(env),request);assert.equal(requests,1);
 await assert.rejects(sendVerificationCode(signup.email,'<script>',emailConfig(env),request));assert.equal(requests,1);
});
