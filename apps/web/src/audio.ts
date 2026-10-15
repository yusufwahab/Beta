import {reportFailure} from './monitoring';
import {api,supabase} from './lib';
import type {VoiceLocale,VoiceMessage} from '@beta/shared';
import recordings from './onboarding-recordings.json';
const promptRecordings:Record<VoiceLocale,Partial<Record<VoiceMessage,string>>>=recordings;
export const hasPrompt=(language:VoiceLocale,prompt:VoiceMessage)=>Boolean(promptRecordings[language][prompt]);
let playing:HTMLAudioElement|null=null;
let player:HTMLAudioElement|null=null;
let finishPrompt:(()=>void)|null=null;
const audioPlayer=()=>player??(player=new Audio());
export function stopAudio(){playing?.pause();if(playing?.src.startsWith('blob:'))URL.revokeObjectURL(playing.src);finishPrompt?.();finishPrompt=null;playing=null;}
export async function playPrompt(language:VoiceLocale,prompt:VoiceMessage){stopAudio();const source=promptRecordings[language][prompt];if(!source)throw new Error('Prompt recording is unavailable');const audio=audioPlayer();audio.src=source;playing=audio;await new Promise<void>((resolve,reject)=>{finishPrompt=resolve;audio.onended=()=>{finishPrompt=null;resolve()};audio.onerror=()=>{finishPrompt=null;reject(new Error('Prompt recording is unavailable'))};void audio.play().catch(error=>{finishPrompt=null;reject(error)});});}
export const ttsService={async speak({text,language}:{text:string;language:VoiceLocale}){const token=(await supabase?.auth.getSession())?.data.session?.access_token;const response=await fetch(`${import.meta.env.VITE_API_BASE_URL??'/api'}/voice/speak`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token??''}`},body:JSON.stringify({text,language,idempotency_key:crypto.randomUUID()}),signal:AbortSignal.timeout(65000)});if(!response.ok){reportFailure('tts_failure');throw new Error('Spoken reply is unavailable');}const url=URL.createObjectURL(await response.blob());stopAudio();const audio=audioPlayer();audio.src=url;playing=audio;audio.onended=()=>URL.revokeObjectURL(url);audio.onerror=()=>URL.revokeObjectURL(url);try{await audio.play();}catch(error){URL.revokeObjectURL(url);throw error;}}};
export async function transcribeOnboarding(blob:Blob,language:VoiceLocale){const form=new FormData();form.set('audio',blob,'recording');form.set('language',language);return api<{text:string;model:string}>('/voice/onboarding/transcribe',form);}
