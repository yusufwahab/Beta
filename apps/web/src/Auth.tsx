import {useVoiceLanguage} from './voice-language';
import {useState} from 'react';
import {Link,Navigate,useNavigate,useSearchParams} from 'react-router-dom';
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {z} from 'zod';
import {useQueryClient} from '@tanstack/react-query';
import {Logo,Field,Button,ErrorBox,Card} from './ui';
import {api,configured,supabase,languageNames} from './lib';
import {useSession,useBusiness} from './session';
import {clearPendingVerification,rememberVerification} from './auth-verification';
const authSchema=z.object({fullName:z.string().trim().max(200).optional(),email:z.email(),password:z.string().min(8,'Use at least 8 characters')});
export function Auth(){
 const [params]=useSearchParams();const mode=params.get('mode')??'login';
 const {session}=useSession();const navigate=useNavigate();
 const [error,setError]=useState<unknown>();const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 const schema=mode==='register'?authSchema.refine(values=>!!values.fullName,{message:'Enter your name.',path:['fullName']}):authSchema;
 const {register,handleSubmit,getValues,formState:{errors}}=useForm({resolver:zodResolver(schema)});
 async function submit(values:z.infer<typeof authSchema>){
  if(!supabase)return;setBusy(true);setError(null);setMessage('');
  try{
   if(mode==='register'){
    const result=await api<{email:string;emailSent:boolean;deliveryError?:string;retryAfter:number}>('/auth/signup',{full_name:values.fullName,email:values.email,password:values.password});
    const pending=rememberVerification(result.email,Date.now()+result.retryAfter*1000);
    navigate('/verify-otp',{state:{...pending,deliveryError:result.deliveryError}});
   }else{
    const result=await supabase.auth.signInWithPassword({email:values.email,password:values.password});
    if(result.error)throw result.error;
    clearPendingVerification();navigate('/app');
   }
  }catch(e){
   if(e instanceof Error&&'code' in e&&e.code==='email_not_confirmed'){
    let deliveryError:string|undefined;
    let retryAfter=60;
    try{
     const result=await api<{requested:boolean;retryAfter?:number}>('/auth/resend',{email:values.email});
     retryAfter=result.retryAfter??60;
    }catch(resendErr){deliveryError=resendErr instanceof Error?resendErr.message:'Unable to send verification code. Use Resend on the next page.';}
    const pending=rememberVerification(values.email,Date.now()+retryAfter*1000);
    navigate('/verify-otp',{state:{...pending,deliveryError}});
   }else setError(e);
  }finally{setBusy(false);}
 }
 async function recover(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(!supabase)return;setBusy(true);setError(null);setMessage('');
  const data=new FormData(event.currentTarget);
  try{
   if(mode==='update'){
    const result=await supabase.auth.updateUser({password:String(data.get('password'))});
    if(result.error)throw result.error;
   }else await api('/auth/recover',{email:String(data.get('email')),redirectTo:window.location.origin+'/auth?mode=update'});
   setMessage(mode==='update'?'Password updated. You can now open your business.':'If an account exists, a recovery link has been sent.');
  }catch(e){setError(e);}finally{setBusy(false);}
 }
 if(session?.user.email_confirmed_at&&mode!=='update')return <Navigate to="/app" replace/>;
 if(mode==='verify')return <Navigate to="/verify-otp" replace/>;
 return <div className="auth-page"><div className="auth-shell">
  <Logo/><div className="eyebrow">YOUR BUSINESS COMPANION</div>
  <h1>{mode==='register'?'A better day starts here.':mode==='recover'?'Let’s get you back in.':mode==='update'?'Choose a new password.':'Welcome back.'}</h1>
  <p className="muted">{mode==='register'?'Create your account. Your records, in your control.':'Your business is right where you left it.'}</p>
  <Card>
   {!configured&&<ErrorBox error="Authentication needs Supabase configuration. Add the frontend environment variables to enable sign-in."/>}
   <ErrorBox error={error}/>
   {message&&<div className="success-box" role="status">{message}</div>}
   {['recover','update'].includes(mode)?<form onSubmit={recover}>
    <Field label={mode==='update'?'New password':'Email address'}><input name={mode==='update'?'password':'email'} type={mode==='update'?'password':'email'} minLength={mode==='update'?8:undefined} required autoComplete={mode==='update'?'new-password':'email'}/></Field>
    <Button type="submit" disabled={!configured||busy}>{busy?'Please wait…':mode==='update'?'Update password':'Send recovery link'}</Button>
   </form>:<form onSubmit={event=>{void handleSubmit(submit)(event);}}>
    {mode==='register'&&<Field label="Your name"><input type="text" autoComplete="name" required maxLength={200} {...register('fullName')} aria-invalid={!!errors.fullName}/>{errors.fullName&&<small role="alert">{errors.fullName.message}</small>}</Field>}
    <Field label="Email address"><input type="email" autoComplete="email" {...register('email')} aria-invalid={!!errors.email}/>{errors.email&&<small role="alert">{errors.email.message}</small>}</Field>
    <Field label="Password"><input type="password" autoComplete={mode==='register'?'new-password':'current-password'} {...register('password')} aria-invalid={!!errors.password}/>{errors.password&&<small role="alert">{errors.password.message}</small>}</Field>
    <Button type="submit" disabled={!configured||busy}>{busy?'Please wait…':mode==='register'?'Create account':'Sign in'}</Button>
   </form>}
   <div className="auth-links">
    <Link to={mode==='register'?'/auth':'/auth?mode=register'}>{mode==='register'?'Already have an account? Sign in':'New to Beta? Create an account'}</Link>
    <Link to="/verify-otp" onClick={()=>{const email=getValues('email');if(z.email().safeParse(email).success)rememberVerification(email);}}>Have a verification code?</Link>
    <Link to="/auth?mode=recover">Forgot password?</Link>
    {session&&<Link to="/app">Open your business</Link>}
   </div>
  </Card>
  <Link to="/" className="muted">← Back to Beta</Link>
 </div></div>;
}
export function Onboarding(){const {language,setLanguage}=useVoiceLanguage();const [error,setError]=useState<unknown>();const [busy,setBusy]=useState(false);const nav=useNavigate();const client=useQueryClient();const {business}=useBusiness();const {session}=useSession();const signupName=typeof session?.user.user_metadata.full_name==='string'?session.user.user_metadata.full_name:'';if(business)return <Navigate to="/app" replace/>;async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));setBusy(true);try{await api('/onboarding',{profile:{trader_name:d.trader_name,preferred_language:d.preferred_language},business:{name:d.name,category:d.category,location:d.location,allow_negative_stock:false}});await client.invalidateQueries({queryKey:['me']});nav('/app')}catch(err){setError(err)}finally{setBusy(false)}}return <div className="auth-page"><div className="auth-shell"><Logo/><h1>Make Beta yours.</h1><p className="muted">A few details, then you’re ready for business.</p><Card><ErrorBox error={error}/><form onSubmit={submit}><Field label="Your name"><input name="trader_name" defaultValue={signupName} required maxLength={200} autoComplete="name"/></Field><Field label="Business name"><input name="name" required maxLength={200}/></Field><Field label="Business category"><select name="category">{['Food & groceries','Fashion & textiles','Household goods','Health & beauty','Other'].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Preferred language"><select name="preferred_language" value={language} onChange={e=>setLanguage(e.target.value)}>{Object.entries(languageNames).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field><Field label="Location (optional)"><input name="location" maxLength={200}/></Field><Button type="submit" disabled={busy}>{busy?'Creating…':'Open my business'}</Button></form></Card></div></div>}
