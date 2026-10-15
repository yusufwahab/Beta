import {prepareValidationAudio,validationEvent,validationEdited,validationConfirmed} from './validation';
import {useState} from 'react';
import {Link} from 'react-router-dom';
import {Volume2,Pencil,Mic} from 'lucide-react';
import {useBusinessApi} from './session';
import {useVoiceLanguage} from './voice-language';
import {voiceText,voiceFieldLabel,voiceActionLabel,reviewText} from '@beta/shared';
import type {ReviewMessage} from '@beta/shared';
import {naira} from './lib';
import {ttsService,stopAudio} from './audio';
import VoiceRecorder from './VoiceRecorder';
import {ErrorBox,Field} from './ui';

type Answer={response:string;transcript?:string;destination?:string;confirmation_id?:string;review_fields?:Record<string,string>;preview?:{total?:string};command:{intent?:string;entities:Record<string,unknown>}};
export default function VoiceAssistant(){
 const {language}=useVoiceLanguage();const {request}=useBusinessApi();
 const [busy,setBusy]=useState(false),[saved,setSaved]=useState(false),[editing,setEditing]=useState(false),[correcting,setCorrecting]=useState(false);
 const [error,setError]=useState<unknown>();const [answer,setAnswer]=useState<Answer>();const [voiceId,setVoiceId]=useState('');const [heard,setHeard]=useState('');const [editedText,setEditedText]=useState('');const [parsedText,setParsedText]=useState('');const [fields,setFields]=useState<Record<string,string>>({});
 const t=(key:ReviewMessage)=>reviewText(language,key);
 const label=(key:string)=>(['description','occurred_on','reason','payment_status','paid_amount'].includes(key)?t(key as ReviewMessage):voiceFieldLabel(language,key));
 async function speak(text:string){try{await ttsService.speak({text,language})}catch{setError(voiceText(language,'unavailable'))}}
 function receive(result:Answer,text:string){setAnswer(result);setEditedText(text);setParsedText(text);setFields(result.review_fields??Object.fromEntries(Object.entries(result.command.entities).filter(([key])=>key!=='period').map(([key,value])=>[key,String(value)])));setEditing(false);setCorrecting(false);}
 async function audio(blob:Blob){setSaved(false);setBusy(true);setError(null);const correctionId=correcting?answer?.confirmation_id:undefined;setAnswer(undefined);try{const form=new FormData();form.set('audio',blob,'recording');form.set('language',language);prepareValidationAudio(form,blob);const voice=await request('/voice/transcribe',form);setVoiceId(voice.id);setHeard(voice.transcript);const result=await request<Answer>('/voice/command',{voice_interaction_id:voice.id,...(correctionId?{correction_of:correctionId}:{})});receive(result,voice.transcript);await speak(result.response);}catch(error){setCorrecting(false);setEditing(false);setError(error)}finally{setBusy(false)}}
 async function reparse(){if(!voiceId)return;validationEvent('TRANSCRIPT_RETRY',undefined,{metadata:{phase:'review'}});setBusy(true);setError(null);stopAudio();try{const result=await request<Answer>('/voice/command',{voice_interaction_id:voiceId,transcript:editedText});receive(result,editedText);await speak(result.response)}catch(error){setAnswer(undefined);setCorrecting(false);setEditing(false);setError(error)}finally{setBusy(false)}}
 async function review(){if(!answer?.confirmation_id)return;setBusy(true);setError(null);stopAudio();try{const result=await request<Answer>('/voice/review',{confirmation_id:answer.confirmation_id,edits:fields,language});receive(result,parsedText);await speak(result.response)}catch(error){setError(error)}finally{setBusy(false)}}
 async function confirm(){if(!answer?.confirmation_id||editing||correcting||editedText!==parsedText)return;validationConfirmed();setBusy(true);setError(null);stopAudio();try{await request('/voice/confirm',{confirmation_id:answer.confirmation_id,confirmed:true});setAnswer(undefined);setHeard('');setSaved(true);await speak(voiceText(language,'saved'));}catch(error){setError(error)}finally{setBusy(false)}}
 return <section className="panel voice-assistant"><h2>{voiceText(language,'talk')}</h2>{!correcting&&<VoiceRecorder onAudio={audio} disabled={busy}/>}<ErrorBox error={error}/>{saved&&<p role="status">{voiceText(language,'saved')}</p>}{busy&&<p role="status">?</p>}
  {heard&&<div className="voice-heard"><label htmlFor="assistant-transcript">{t('heard')}</label><blockquote>{heard}</blockquote><textarea id="assistant-transcript" aria-label={t('heard')} value={editedText} disabled={busy} onChange={e=>{validationEdited('transcript');setEditedText(e.target.value)}}/>{editedText!==parsedText&&<button className="btn-secondary" disabled={busy||!editedText.trim()} onClick={()=>void reparse()}>{t('reparse')}</button>}</div>}
  {answer&&<div aria-live="polite"><p>{answer.response}</p><button className="btn-secondary" onClick={()=>void speak(answer.response)} disabled={busy}><Volume2/>{voiceText(language,'hear')}</button>
   {answer.confirmation_id&&<div className="voice-answer"><h3>{voiceActionLabel(language,answer.command.intent??'')}</h3>
    {editing?<div className="voice-edit-fields">{Object.entries(fields).map(([key,value])=><Field key={key} label={label(key)}>{key==='payment_status'?<select value={value} disabled={busy} onChange={e=>{validationEdited(key);setFields({...fields,[key]:e.target.value})}}>{['unknown','paid','unpaid','partial'].map(value=><option key={value}>{value}</option>)}</select>:<input value={value} disabled={busy} type={key==='occurred_on'?'date':['quantity','unit_price','amount','paid_amount'].includes(key)?'number':'text'} step={key==='quantity'?'1':'0.01'} min={key==='quantity'?'1':'0'} maxLength={200} onChange={e=>{validationEdited(key);setFields({...fields,[key]:e.target.value})}}/>}</Field>)}</div>:<dl>{Object.entries(answer.review_fields??answer.command.entities).filter(([key,value])=>key!=='period'&&value!=='').map(([key,value])=><div className="summary-line" key={key}><dt>{label(key)}</dt><dd>{['amount','unit_price','paid_amount'].includes(key)?naira(String(value)):String(value)}</dd></div>)}</dl>}
    {!editing&&answer.preview?.total&&<div className="summary-line"><span>{t('total')}</span><strong>{naira(answer.preview.total)}</strong></div>}
    {correcting&&<div><p>{t('correctHint')}</p><VoiceRecorder onAudio={audio} disabled={busy}/></div>}
    <div className="button-row">{editing?<><button className="btn-primary" disabled={busy} onClick={()=>void review()}>{t('review')}</button><button className="btn-secondary" disabled={busy} onClick={()=>setEditing(false)}>{t('cancelEdit')}</button></>:<><button className="btn-secondary" disabled={busy} onClick={()=>{stopAudio();setCorrecting(!correcting)}}><Mic size={17}/>{t('correctVoice')}</button><button className="btn-secondary" disabled={busy} onClick={()=>{stopAudio();setCorrecting(false);setEditing(true)}}><Pencil size={17}/>{t('edit')}</button><button className="btn-primary" disabled={busy||correcting||editedText!==parsedText} onClick={()=>void confirm()}>{voiceText(language,'confirmSave')}</button></>}
    <button className="btn-secondary" disabled={busy} onClick={async()=>{validationEvent('VOICE_CANCELLED',undefined,{metadata:{phase:'review'}});setBusy(true);stopAudio();try{await request('/voice/cancel',{cancelled:true});setAnswer(undefined);setSaved(false);setHeard('');setCorrecting(false);setEditing(false);setError(null);}catch(error){setError(error)}finally{setBusy(false)}}}>{voiceText(language,'cancelAction')}</button></div>
   </div>}{answer.destination&&<Link className="btn-primary" to={answer.destination} state={{voiceDraft:answer.command.entities}}>{voiceText(language,'reviewDetails')}</Link>}
  </div>}
 </section>;
}
