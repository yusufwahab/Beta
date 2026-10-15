import {newValidationContext,tagRecording} from './validation-context';
import {validationEvent} from './validation';
import type {ValidationContext} from './validation-context';
import {useEffect,useRef,useState} from 'react';
import {Mic,Pause,Play,X,Check,Loader2} from 'lucide-react';
import {voiceText} from '@beta/shared';
import {useVoiceLanguage} from './voice-language';
import {ErrorBox} from './ui';
import {beginVoiceCapture,playStaticAudio,stopStaticAudio} from './audio';
export default function VoiceRecorder({onAudio,disabled=false}:{onAudio:(audio:Blob)=>Promise<void>;disabled?:boolean}){
 const {language}=useVoiceLanguage();const [phase,setPhase]=useState<'idle'|'arming'|'recording'|'paused'|'processing'>('idle');const [error,setError]=useState<unknown>();const [url,setUrl]=useState('');const releaseCapture=useRef<(()=>void)|null>(null);const recorder=useRef<MediaRecorder|null>(null);const stream=useRef<MediaStream|null>(null);const timer=useRef<ReturnType<typeof setTimeout>|null>(null);const chunks=useRef<BlobPart[]>([]);const current=useRef(onAudio);const mounted=useRef(true);const cancelled=useRef(false);const validation=useRef<ValidationContext|null>(null);
 useEffect(()=>{current.current=onAudio;},[onAudio]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if((recorder.current?.state==='recording'||recorder.current?.state==='paused')&&!cancelled.current&&validation.current){cancelled.current=true;validationEvent('VOICE_CANCELLED',validation.current,{metadata:{phase:'recording'}});}releaseCapture.current?.();if(timer.current)clearTimeout(timer.current);if(recorder.current?.state==='recording'||recorder.current?.state==='paused')recorder.current.stop();stream.current?.getTracks().forEach(t=>t.stop());stopStaticAudio();};},[]);
 useEffect(()=>()=>{if(url)URL.revokeObjectURL(url);},[url]);
 async function start(){validation.current=newValidationContext();releaseCapture.current=beginVoiceCapture();setPhase('arming');cancelled.current=false;chunks.current=[];try{setError(null);if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw new Error('Microphone recording requires a supported browser and HTTPS or localhost');const media=await navigator.mediaDevices.getUserMedia({audio:true});if(!mounted.current){releaseCapture.current?.();media.getTracks().forEach(t=>t.stop());return;}stream.current=media;const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(x=>MediaRecorder.isTypeSupported(x));const next=new MediaRecorder(media,mime?{mimeType:mime}:undefined);recorder.current=next;next.ondataavailable=e=>{if(e.data.size)chunks.current.push(e.data)};next.onstop=()=>{releaseCapture.current?.();media.getTracks().forEach(t=>t.stop());if(timer.current)clearTimeout(timer.current);if(!mounted.current||cancelled.current){setPhase('idle');return;}const blob=new Blob(chunks.current,{type:next.mimeType.split(';')[0]});if(!blob.size||blob.size>8*1024*1024){setPhase('idle');setError('Recording must be nonempty and smaller than 8 MiB');return;}if(validation.current){tagRecording(blob,validation.current);validation.current.submitted=true;validationEvent('VOICE_SUBMITTED',validation.current,{metadata:{phase:'recording'}});}setUrl(URL.createObjectURL(blob));setPhase('processing');playStaticAudio('loading_response',language);void current.current(blob).catch(setError).finally(()=>{stopStaticAudio();if(mounted.current)setPhase('idle');});};next.onerror=()=>{releaseCapture.current?.();media.getTracks().forEach(t=>t.stop());if(mounted.current)setPhase('idle');setError('Recording failed. Please try again.');};next.start();if(validation.current)validationEvent('VOICE_STARTED',validation.current,{metadata:{phase:'recording'}});setPhase('recording');timer.current=setTimeout(()=>{if(next.state==='recording'||next.state==='paused')next.stop()},30000);}catch(error){releaseCapture.current?.();stream.current?.getTracks().forEach(t=>t.stop());if(mounted.current)setPhase('idle');setError(error)}}
 function pause(){if(recorder.current?.state==='recording'){recorder.current.pause();if(validation.current)validationEvent('VOICE_PAUSED',validation.current,{metadata:{phase:'recording'}});setPhase('paused');}}
 function resume(){if(recorder.current?.state==='paused'){recorder.current.resume();if(validation.current)validationEvent('VOICE_RESUMED',validation.current,{metadata:{phase:'recording'}});setPhase('recording');}}
 function finish(){if(recorder.current?.state==='recording'||recorder.current?.state==='paused')recorder.current.stop();}
 function cancel(){if(!cancelled.current&&validation.current)validationEvent('VOICE_CANCELLED',validation.current,{metadata:{phase:'recording'}});cancelled.current=true;if(recorder.current?.state==='recording'||recorder.current?.state==='paused')recorder.current.stop();else{releaseCapture.current?.();stream.current?.getTracks().forEach(t=>t.stop());setPhase('idle');}setError(null);}
 const recording=phase==='recording';const paused=phase==='paused';const processing=phase==='processing';const active=recording||paused;
 return <div>
  <ErrorBox error={error}/>
  {processing
   ?<div className="voice-processing" role="status"><Loader2 size={42} className="spin"/><p>{language==='ha'?'Jira, Beta tana sauraro…':language==='yo'?'Dúró, Beta ń gbọ́…':language==='ig'?'Chere, Beta na-ege…':'Processing your voice…'}</p></div>
   :<><button type="button" className={`voice-orb ${recording?'is-speaking':paused?'is-paused':''}`} disabled={disabled||phase==='arming'} onClick={()=>active?finish():void start()} aria-label={voiceText(language,recording?'stop':'record')}>{active?<Check size={42}/>:<Mic size={42}/>}</button>
   <p>{recording?voiceText(language,'stop'):paused?voiceText(language,'stop'):voiceText(language,'record')}</p>
   {active&&<div className="voice-recorder-controls">
    {recording?<button type="button" className="btn-secondary" onClick={pause} aria-label="Pause recording"><Pause size={17}/>Pause</button>:<button type="button" className="btn-secondary" onClick={resume} aria-label="Resume recording"><Play size={17}/>Resume</button>}
    <button type="button" className="btn-secondary" onClick={cancel} aria-label="Cancel recording"><X size={17}/>Cancel</button>
   </div>}
   {url&&phase==='idle'&&<audio aria-label="Your recording" controls src={url}/>}</>}
 </div>;
}
