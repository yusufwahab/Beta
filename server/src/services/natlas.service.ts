import {saleIntent} from './intent.service.js';
import { languages } from '@beta/shared';
import { AppError } from '../db.js';
import { z } from 'zod';
export const asrModels={en:'NCAIR1/NigerianAccentedEnglish',yo:'NCAIR1/Yoruba-ASR',ha:'NCAIR1/Hausa-ASR',ig:'NCAIR1/Igbo-ASR'} as const;
export function natlasStatus(){const asr_configured=!!(process.env.NATLAS_BASE_URL&&process.env.NATLAS_API_KEY);const interpretation_configured=true;return {configured:asr_configured&&interpretation_configured,asr_configured,interpretation_configured,verified:false,languages,intent_engine:'beta-rules-v1',contract:'modal-asr-v1'};}
async function request(path:string,body:FormData){
 if(!natlasStatus().asr_configured)throw new AppError(503,'N-ATLAS is unavailable. Configure Modal ASR. Manual checkout remains available.');
 let base:URL;try{base=new URL(process.env.NATLAS_BASE_URL!);}catch{throw new AppError(503,'N-ATLAS URL is invalid');}
 if(base.protocol!=='https:'&&base.hostname!=='localhost'&&base.hostname!=='127.0.0.1')throw new AppError(503,'N-ATLAS requires HTTPS');
 try{const response=await fetch(`${base.href.replace(/\/$/,'')}${path}`,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${process.env.NATLAS_API_KEY}`},body,signal:AbortSignal.timeout(145000)});if(!response.ok){const messages:Record<number,string>={400:'Audio is empty.',413:'Recording must be at most 8 MiB and 30 seconds.',415:'Unsupported recording format.',422:'Audio could not be recognized. Please record again.',504:'Transcription timed out. Please retry.'};throw new AppError([400,413,415,422].includes(response.status)?response.status:502,messages[response.status]??'N-ATLAS service rejected the request. Check server configuration and model access.');}return await response.json();}catch(e){if(e instanceof AppError)throw e;throw new AppError(502,'N-ATLAS request failed or timed out. Please retry or use manual checkout.');}
}
export async function transcribe(buffer:Buffer,mime:string,language:string){
 const selected=z.enum(languages).parse(language);const expected=asrModels[selected];const configured=process.env[`NATLAS_ASR_MODEL_${selected.toUpperCase()}`];if(configured&&configured!==expected)throw new AppError(503,'ASR model configuration must use the official NCAIR repository');
 const form=new FormData();const extension=mime.includes('wav')?'wav':mime.includes('ogg')?'ogg':mime.includes('mp4')?'mp4':'webm';form.set('audio',new Blob([new Uint8Array(buffer)],{type:mime}),`recording.${extension}`);form.set('language',selected);
 const result=z.object({success:z.literal(true),transcript:z.string().trim().min(1).max(16000),language:z.literal(selected),model:z.literal(expected)}).safeParse(await request('/transcribe',form));if(!result.success)throw new AppError(502,'N-ATLAS returned an invalid transcription response');return {text:result.data.transcript,language:result.data.language,model:result.data.model};
}
export async function interpret(text:string,products:unknown[],language:string,scope:string){
 z.enum(languages).parse(language);return saleIntent(text,products as {name:string;selling_price?:string}[],scope);
}
