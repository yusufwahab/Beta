// Real HTTP inference with your own audio; Node 22+, no additional dependencies.
// node infra/test_natlas.mjs --audio path/to/recording.wav --language yo
import {readFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
try{process.loadEnvFile('server/.env');}catch(error){if(error.code!=='ENOENT')throw error;}
const {values}=parseArgs({options:{audio:{type:'string'},language:{type:'string',default:'en'}}});
const base=process.env.NATLAS_BASE_URL?.replace(/\/$/,'');
if(!base)throw new Error('Configure NATLAS_BASE_URL in server/.env after a successful deployment');
const health=await fetch(`${base}/health`,{signal:AbortSignal.timeout(60000),redirect:'error'});
console.log(JSON.stringify({route:'/health',status:health.status,body:await health.json()},null,2));
if(!health.ok)process.exit(1);
if(values.audio){
 if(!['en','yo','ha','ig'].includes(values.language))throw new Error('Language must be en, yo, ha or ig');
 if(!process.env.NATLAS_API_KEY)throw new Error('NATLAS_API_KEY is missing from server/.env');
 const raw=await readFile(values.audio);if(!raw.length||raw.length>8*1024*1024)throw new Error('Audio must be nonempty and at most 8 MiB');
 const extension=values.audio.split('.').at(-1).toLowerCase();
 const mime={wav:'audio/wav',webm:'audio/webm',ogg:'audio/ogg',mp4:'audio/mp4',m4a:'audio/mp4',mp3:'audio/mpeg',flac:'audio/flac'}[extension];
 if(!mime)throw new Error('Use a supported audio file extension');
 const form=new FormData();form.set('audio',new Blob([raw],{type:mime}),`recording.${extension}`);form.set('language',values.language);
 const response=await fetch(`${base}/transcribe`,{method:'POST',headers:{Authorization:`Bearer ${process.env.NATLAS_API_KEY}`},body:form,redirect:'error',signal:AbortSignal.timeout(145000)});
 console.log(JSON.stringify({kind:'REAL HTTP inference',route:'/transcribe',status:response.status,body:await response.json()},null,2));
 if(!response.ok)process.exit(1);
}
