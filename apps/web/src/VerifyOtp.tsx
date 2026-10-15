import {useEffect,useState} from 'react';
import {Link,Navigate,useLocation,useNavigate} from 'react-router-dom';
import {Logo,Field,Button,ErrorBox,Card,Loading} from './ui';
import {api,configured,supabase} from './lib';
import {useSession} from './session';
import {clearPendingVerification,pendingVerificationSchema,readPendingVerification,rememberVerification} from './auth-verification';

export default function VerifyOtp(){
 const navigate=useNavigate();const location=useLocation();const {session,ready}=useSession();
 const [pending]=useState(()=>{
  const state=pendingVerificationSchema.safeParse(location.state);
  return state.success?state.data:readPendingVerification();
 });
 const email=pending?.email??session?.user.email??'';
 const [code,setCode]=useState('');
 const [retryAt,setRetryAt]=useState(pending?.retryAt??0);
 const [remaining,setRemaining]=useState(()=>Math.max(0,Math.ceil(((pending?.retryAt??0)-Date.now())/1000)));
 const [busy,setBusy]=useState<'verify'|'resend'|null>(null);
 const [error,setError]=useState<unknown>(()=>location.state?.deliveryError?new Error(location.state.deliveryError):null);const [message,setMessage]=useState('');
 useEffect(()=>{
  const timer=window.setInterval(()=>setRemaining(Math.max(0,Math.ceil((retryAt-Date.now())/1000))),1000);
  return ()=>window.clearInterval(timer);
 },[retryAt]);
 async function verify(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(!supabase||busy||!email)return;
  setError(null);setMessage('');
  if(!/^\d{6,10}$/.test(code)){setError(new Error('Enter the numeric verification code from your email.'));return;}
  setBusy('verify');
  try{
   const result=await supabase.auth.verifyOtp({email,token:code,type:'email'});
   if(result.error)throw result.error;
   if(!result.data.session||!result.data.user?.email_confirmed_at)throw new Error('Email verification did not complete. Please try again.');
   clearPendingVerification();navigate('/app',{replace:true});
  }catch(e){setError(e);}finally{setBusy(null);}
 }
 async function resend(){
  if(!supabase||busy||Date.now()<retryAt||!email)return;
  setError(null);setMessage('');setBusy('resend');
  try{
   await api('/auth/resend',{email});
   const next=Date.now()+60000;rememberVerification(email,next);
   // Keep history state current as well, so refreshes preserve the resend cooldown.
   navigate('/verify-otp',{replace:true,state:{email,retryAt:next}});
   setRetryAt(next);setRemaining(60);setCode('');
   setMessage('Verification requested. If your account still needs verification, check your inbox and spam folder for the latest code.');
  }catch(e){setError(e);}finally{setBusy(null);}
 }
 if(!ready)return <Loading/>;
 if(session?.user.email_confirmed_at)return <Navigate to="/app" replace/>;
 if(!email)return <Navigate to="/auth" replace/>;
 return <div className="auth-page"><div className="auth-shell">
  <Logo/><div className="eyebrow">VERIFY YOUR ACCOUNT</div>
  <h1>Enter your verification code.</h1>
  <p className="muted">Use the code for <strong>{email}</strong> to finish creating your account.</p>
  <Card>
   {!configured&&<ErrorBox error="Email verification is currently unavailable."/>}
   <ErrorBox error={error}/>
   {message&&<div className="success-box" role="status">{message}</div>}
   <form onSubmit={verify}>
    <Field label="Verification code"><input name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" minLength={6} maxLength={10} required autoFocus value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,''))} disabled={!!busy}/></Field>
    <Button type="submit" disabled={!configured||!!busy}>{busy==='verify'?'Verifying…':'Verify and continue'}</Button>
    <Button secondary onClick={resend} disabled={!configured||!!busy||remaining>0}>{busy==='resend'?'Requesting…':remaining>0?'Resend code ('+remaining+'s)':'Resend code'}</Button>
   </form>
   <p className="muted">If the code has expired, request another.</p>
   <div className="auth-links"><Link to="/auth">Back to sign in</Link><Link to="/auth?mode=register">Use another email</Link></div>
  </Card>
  <Link to="/" className="muted">← Back to Beta</Link>
 </div></div>;
}
