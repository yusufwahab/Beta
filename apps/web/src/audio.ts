import {prepareValidationAudio} from './validation';
import {reportFailure} from './monitoring';
import {api,supabase} from './lib';
import type {VoiceLocale,VoiceMessage} from '@beta/shared';
import recordings from './onboarding-recordings.json';
const promptRecordings:Record<VoiceLocale,Partial<Record<VoiceMessage,string>>>=recordings;
export const hasPrompt=(language:VoiceLocale,prompt:VoiceMessage)=>Boolean(promptRecordings[language][prompt]);
let playing:HTMLAudioElement|null=null;
let speechVersion=0;
let speechAbort:AbortController|null=null;
let captures=0;
export function beginVoiceCapture(){stopAudio();captures++;let released=false;return ()=>{if(!released){released=true;captures--;}};}
let player:HTMLAudioElement|null=null;
let finishPrompt:(()=>void)|null=null;
const audioPlayer=()=>player??(player=new Audio());
export function stopAudio(){speechVersion++;speechAbort?.abort();speechAbort=null;playing?.pause();if(playing?.src.startsWith('blob:'))URL.revokeObjectURL(playing.src);finishPrompt?.();finishPrompt=null;playing=null;}
export async function playPrompt(language:VoiceLocale,prompt:VoiceMessage){if(captures)return;stopAudio();const source=promptRecordings[language][prompt];if(!source)throw new Error('Prompt recording is unavailable');const audio=audioPlayer();audio.src=source;playing=audio;await new Promise<void>((resolve,reject)=>{finishPrompt=resolve;audio.onended=()=>{finishPrompt=null;resolve()};audio.onerror=()=>{finishPrompt=null;reject(new Error('Prompt recording is unavailable'))};void audio.play().catch(error=>{finishPrompt=null;reject(error)});});}
export const ttsService={async speak({text,language}:{text:string;language:VoiceLocale}){
 if(captures)return;stopAudio();const version=speechVersion;const controller=new AbortController();speechAbort=controller;
 try{const token=(await supabase?.auth.getSession())?.data.session?.access_token;
 const response=await fetch(`${import.meta.env.VITE_API_BASE_URL??'/api'}/voice/speak`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token??''}`},body:JSON.stringify({text,language,idempotency_key:crypto.randomUUID()}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(65000)])});
 if(version!==speechVersion)return;
 if(!response.ok){reportFailure('tts_failure');throw new Error('Spoken reply is unavailable');}
 const bytes=await response.blob();if(version!==speechVersion)return;
 const url=URL.createObjectURL(bytes);const audio=audioPlayer();audio.src=url;playing=audio;audio.onended=()=>URL.revokeObjectURL(url);audio.onerror=()=>URL.revokeObjectURL(url);
 try{await audio.play();}catch(error){URL.revokeObjectURL(url);throw error;}
 }catch(error){if(controller.signal.aborted)return;throw error;}
}};
export async function transcribeOnboarding(blob:Blob,language:VoiceLocale){const form=new FormData();form.set('audio',blob,'recording');form.set('language',language);prepareValidationAudio(form,blob);return api<{text:string;model:string}>('/voice/onboarding/transcribe',form);}
const staticAudioFiles:Partial<Record<VoiceLocale,Record<string,string>>>={ha:{loading_response:'/audio/ha/loading_response.mp3'},yo:{loading_response:'/audio/yo/loading_response.mp3'},ig:{loading_response:'/audio/ig/loading_response.mp3'}};
let staticPlaying:HTMLAudioElement|null=null;
export function stopStaticAudio(){staticPlaying?.pause();staticPlaying=null;}
export function playStaticAudio(key:string,language:VoiceLocale){stopStaticAudio();const src=staticAudioFiles[language]?.[key];if(!src)return;const audio=new Audio(src);staticPlaying=audio;audio.onended=()=>{if(staticPlaying===audio)staticPlaying=null;};audio.onerror=()=>{if(staticPlaying===audio)staticPlaying=null;};void audio.play().catch(()=>{if(staticPlaying===audio)staticPlaying=null;});}
