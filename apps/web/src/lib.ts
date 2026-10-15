import {reportFailure} from './monitoring';
import {createClient} from '@supabase/supabase-js';
export const configured=!!(import.meta.env.VITE_SUPABASE_URL&&import.meta.env.VITE_SUPABASE_ANON_KEY);
export const supabase=configured?createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_ANON_KEY):null;
export async function api<T=any>(path:string,body?:unknown,method?:string):Promise<T>{const token=(await supabase?.auth.getSession())?.data.session?.access_token;const response=await fetch(`${import.meta.env.VITE_API_BASE_URL??'/api'}${path}`,{method:method??(body?'POST':'GET'),headers:{...(body instanceof FormData?{}:{'Content-Type':'application/json'}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});const result=await response.json();if(!response.ok){reportFailure(path.includes('voice')?'voice_request_failed':'api_request_failed');throw new Error(result.error?.message??'Request failed');}return result.data;}
export const naira=(value:string|number|null|undefined)=>value===null?'Not available':new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:2}).format(Number(value??0));
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const languageNames:Record<string,string>={en:'Nigerian English',yo:'Yorùbá',ha:'Hausa',ig:'Igbo'};
