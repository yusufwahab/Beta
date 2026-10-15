// Reads current provider metadata; does not synthesize speech or print the API key.
process.loadEnvFile('server/.env');
if(!process.env.YARNGPT_API_KEY)throw new Error('Configure server/.env YARNGPT_API_KEY first');
const response=await fetch('https://api.yarngpt.ai/api/v1/voices',{headers:{Authorization:`Bearer ${process.env.YARNGPT_API_KEY}`},redirect:'error',signal:AbortSignal.timeout(20000)});
if(!response.ok)throw new Error(`YarnGPT voice catalogue returned HTTP ${response.status}`);
const payload=await response.json();
const voices=Array.isArray(payload)?payload:payload.voices??payload.data?.voices??payload.data;
if(!Array.isArray(voices))throw new Error('Unrecognized voice catalogue response; consult current provider documentation');
console.log(JSON.stringify(voices.map(voice=>({id:voice.id??voice.name,name:voice.name,languages:voice.languages??voice.supported_languages??[],default:voice.default??false})),null,2));
