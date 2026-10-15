import {test} from 'node:test';
import assert from 'node:assert/strict';
import {asrModels,transcribe,natlasStatus} from './services/natlas.service.js';

test('Modal contract routes all four languages, keeps extraction separate, rejects mismatched models',async()=>{
 const originalFetch=globalThis.fetch;const previous={...process.env};
 process.env.NATLAS_BASE_URL='https://example.test';process.env.NATLAS_API_KEY='test-private-key';delete process.env.NATLAS_LLM_BASE_URL;
 try{
  assert.equal(natlasStatus().asr_configured,true);assert.equal(natlasStatus().interpretation_configured,true);
  for(const language of ['en','yo','ha','ig'] as const){
   globalThis.fetch=async(url,options)=>{
    assert.equal(url,'https://example.test/transcribe');assert.equal(options?.redirect,'error');
    assert.equal((options?.headers as Record<string,string>).Authorization,'Bearer test-private-key');
    const form=options?.body as FormData;assert.ok(form.get('audio') instanceof Blob);assert.equal(form.get('language'),language);assert.equal(form.has('file'),false);
    return Response.json({success:true,language,model:asrModels[language],transcript:'real shape, mocked inference'});
   };
   assert.deepEqual(await transcribe(Buffer.from('test audio'),'audio/webm',language),{text:'real shape, mocked inference',language,model:asrModels[language]});
  }
  globalThis.fetch=async()=>Response.json({success:true,language:'yo',model:'openai/whisper-small',transcript:'wrong model'});
  await assert.rejects(transcribe(Buffer.from('test'),'audio/wav','yo'),/invalid transcription/);
  globalThis.fetch=async()=>Response.json({detail:'internal private trace'},{status:503});
  await assert.rejects(transcribe(Buffer.from('test'),'audio/wav','en'),/service rejected/);
  await assert.rejects(transcribe(Buffer.from('test'),'audio/wav','fr'));
 }finally{globalThis.fetch=originalFetch;for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);}
});
