import {useEffect,useRef,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {useQueryClient} from '@tanstack/react-query';
import {ArrowRight,Volume2,Pause,CheckCircle2} from 'lucide-react';
import {journeySteps,journeyRoutes,journeyText} from '@beta/shared';
import type {Journey,JourneyMessage} from '@beta/shared';
import {useBusiness,useBusinessApi,useBusinessQuery} from './session';
import {useVoiceLanguage} from './voice-language';
import {ttsService,stopAudio} from './audio';
import {ErrorBox} from './ui';
import './journey.css';

export default function JourneyGuide(){
 const {business,profile}=useBusiness();const {language}=useVoiceLanguage();const query=useBusinessQuery<Journey>('/journey');const {request}=useBusinessApi();const nav=useNavigate();const client=useQueryClient();
 const visited=useRef<string|null>(null);const spoken=useRef('');const [entry,setEntry]=useState<{step:string|null;returning:boolean}|null>(null);
 const [busy,setBusy]=useState(false);const [error,setError]=useState<unknown>();const [audioUnavailable,setAudioUnavailable]=useState(false);const [finished,setFinished]=useState(false);
 const guide=query.data?.state?query.data:undefined;
 useEffect(()=>{if(!business?.id||visited.current===business.id)return;visited.current=business.id;void request<Journey>('/journey',{action:'visit'}).then(result=>{client.setQueryData(['business',business.id,'/journey'],result);setEntry({step:result.step,returning:(result.state?.visits??0)>1});}).catch(setError);},[business?.id,request,client]);
 const step=guide?.step??null;const recommendation=guide?.recommendation;
 const t=(key:JourneyMessage,values:Record<string,string|number>={})=>journeyText(language,key,values);
 const name=profile?.trader_name??'';
 const message=finished?t('done'):step?(entry?.returning&&entry.step===step?t(step==='expense'&&guide!.state.completed.includes('sale')?'backExpense':'back',{name})+' '+(step==='expense'?'':step==='product'?t('productLabel')+'.':t(step,{name})):t(step,{name})):recommendation?t(recommendation.kind==='expense'?'expenseTip':'stockTip',{amount:Number(recommendation.amount??0).toLocaleString('en-NG'),product:recommendation.product??'',quantity:recommendation.quantity??0}):'';
 const automatic=!!guide&&!guide.state.paused&&(!!step||finished)&&guide.state.visits>0;
 useEffect(()=>{
  if(!automatic||!message)return;
  const key=`${business?.id}:${language}:${step}:${finished}`;if(spoken.current===key)return;
  const timer=setTimeout(()=>{spoken.current=key;setAudioUnavailable(false);void ttsService.speak({text:message,language}).catch(()=>setAudioUnavailable(true));},400);
  return ()=>clearTimeout(timer);
 },[automatic,message,language,step,finished,business?.id]);
 async function change(action:string){if(!guide)return false;stopAudio();setBusy(true);setError(null);try{const result=await request<Journey>('/journey',{action,...(['skip','known','summary'].includes(action)?{step}:{}),...(action==='dismiss'?{recommendation_id:recommendation?.id}:{})});client.setQueryData(['business',business?.id,'/journey'],result);if(step&&!result.step)setFinished(true);return true;}catch(error){setError(error);void query.refetch();return false;}finally{setBusy(false)}}
 if(!guide)return query.error?<div className="journey-guide"><ErrorBox error={query.error}/><button className="btn-secondary" onClick={()=>void query.refetch()}>Retry guide</button></div>:null;
 if(guide.state.paused)return <section className="journey-paused"><p>{t('paused')}</p><button className="btn-secondary" disabled={busy} onClick={()=>{spoken.current='';void change('resume')}}>{t('resume')}</button><ErrorBox error={error}/></section>;
 if(!message)return null;
 return <section className="journey-guide" aria-label={step?t('title'):t('tip')}>
  <div className="journey-heading"><span className="journey-icon">{finished?<CheckCircle2 size={21}/>:<Volume2 size={21}/>}</span><strong>{step?t('title'):finished?t('title'):t('tip')}</strong>{step&&<span className="journey-count">{journeySteps.indexOf(step)+1} / {journeySteps.length}</span>}</div>
  {step&&<ol className="journey-progress" aria-label={t('title')}>{journeySteps.map(item=><li key={item} aria-current={item===step?'step':undefined} className={guide.state.completed.includes(item)?'complete':guide.state.skipped.includes(item)||guide.state.known.includes(item)?'passed':''}><span/>{t(`${item}Label`)}</li>)}</ol>}
  <p className="journey-message" aria-live="polite">{message}</p>
  <ErrorBox error={error}/>{audioUnavailable&&<p className="muted" role="status">{t('audioUnavailable')}</p>}
  <div className="journey-actions">
   {finished?<button className="btn-primary" onClick={()=>{stopAudio();setFinished(false)}}>{t('continue')}</button>:step?<button className="btn-primary" disabled={busy} onClick={async()=>{stopAudio();if(step==='summary'&&!await change('summary'))return;nav(journeyRoutes[step]);}}>{t(`${step}Label`)}<ArrowRight size={16}/></button>:recommendation&&<Link className="btn-primary" to={recommendation.kind==='expense'?'/app/expenses':'/app/inventory'} onClick={stopAudio}>{t(recommendation.kind==='expense'?'expenseLabel':'productLabel')}<ArrowRight size={16}/></Link>}
   <button className="btn-secondary" disabled={busy} onClick={()=>{setAudioUnavailable(false);void ttsService.speak({text:message,language}).catch(()=>setAudioUnavailable(true));}}><Volume2 size={16}/>{t('hear')}</button>
   <button className="journey-text-button" disabled={busy} onClick={()=>finished?(stopAudio(),setFinished(false)):void change(step?'skip':'dismiss')}>{t('skip')}</button>
   {(step||recommendation)&&<><button className="journey-text-button" disabled={busy} onClick={()=>void change(step?'known':'dismiss')}>{t('known')}</button><button className="journey-text-button" disabled={busy} onClick={()=>void change('pause')}><Pause size={14}/>{t('pause')}</button></>}
  </div>
 </section>;
}
