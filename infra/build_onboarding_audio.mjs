// Build STATIC onboarding assets; never invoked during a trader's onboarding.
// Requires configured YarnGPT account/voices; synthesis consumes provider credits.
import {mkdir,writeFile} from 'node:fs/promises';
import {voiceText} from '../packages/shared/dist/index.js';
process.loadEnvFile('server/.env');
if(!process.env.YARNGPT_API_KEY)throw new Error('Obtain a YarnGPT API key and set server/.env YARNGPT_API_KEY');
const prompts=['welcome','name','category','business','confirm','again','ready'];
for(const language of ['en','yo','ha','ig']){
 const voice=process.env[`YARNGPT_VOICE_${language.toUpperCase()}`];if(!voice)throw new Error(`Configure YARNGPT_VOICE_${language.toUpperCase()} using the provider voice catalogue`);
 await mkdir(`apps/web/public/audio/${language}`,{recursive:true});
 for(const prompt of prompts){const response=await fetch('https://api.yarngpt.ai/api/v1/streaming/conversation',{method:'POST',headers:{Authorization:`Bearer ${process.env.YARNGPT_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`beta-onboarding-v1-${language}-${prompt}`},body:JSON.stringify({text:voiceText(language,prompt),voice,output_format:'wav'}),signal:AbortSignal.timeout(90000)});if(!response.ok||!response.headers.get('content-type')?.startsWith('audio/'))throw new Error(`Prompt generation failed: ${language}/${prompt} HTTP ${response.status}`);const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length<44||bytes.toString('ascii',0,4)!=='RIFF')throw new Error('Provider did not return a WAV');await writeFile(`apps/web/public/audio/${language}/${prompt}.wav`,bytes);console.log(`Created ${language}/${prompt}.wav`);}
}
