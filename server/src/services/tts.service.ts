import {z} from 'zod';
import {languages} from '@beta/shared';
import {AppError} from '../db.js';
export const speechSchema=z.object({text:z.string().trim().min(1).max(1200),language:z.enum(languages),idempotency_key:z.uuid()});
export async function synthesize(input:unknown){
 const value=speechSchema.parse(input);if(!process.env.YARNGPT_API_KEY)throw new AppError(503,'Spoken replies are unavailable. Configure YARNGPT_API_KEY.');
 const voice=process.env[`YARNGPT_VOICE_${value.language.toUpperCase()}`];if(!voice)throw new AppError(503,'A YarnGPT voice for this language has not been configured');
 try{const response=await fetch('https://api.yarngpt.ai/api/v1/streaming/conversation',{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers:{Authorization:`Bearer ${process.env.YARNGPT_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':value.idempotency_key},body:JSON.stringify({text:value.text,voice,output_format:'mp3'})});
 if(!response.ok||!response.headers.get('content-type')?.startsWith('audio/'))throw new AppError(502,'YarnGPT could not produce a spoken reply');
 const reader=response.body?.getReader();if(!reader)throw new AppError(502,'YarnGPT returned no audio');const chunks:Uint8Array[]=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8*1024*1024)throw new AppError(502,'Spoken reply exceeded the audio limit');chunks.push(value);}}finally{await reader.cancel();}if(!size)throw new AppError(502,'YarnGPT returned empty audio');return Buffer.concat(chunks);
 }catch(error){if(error instanceof AppError)throw error;throw new AppError(502,'Spoken reply failed or timed out');}
}
