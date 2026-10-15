import {test,expect} from '@playwright/test';
import recordings from '../../apps/web/src/onboarding-recordings.json' with {type:'json'};

test('REAL audio: every supplied recording plays to completion in the browser',async({page},testInfo)=>{
 await page.goto('/start');
 const results=[];
 for(const source of Object.values(recordings).flatMap(prompts=>Object.values(prompts))){
  const response=await page.request.get(source);
  expect(response.ok(),source).toBeTruthy();
  expect(response.headers()['content-type']).toMatch(/^audio\//);
  // Real HTMLAudioElement decoding/playback. Muting and faster playback keep CI quiet/quick.
  const result=await page.evaluate(async url=>{
   const audio=new Audio(url);audio.muted=true;audio.playbackRate=8;
   try{return await new Promise<{source:string;duration:number;ended:boolean}>((resolve,reject)=>{
    const timer=setTimeout(()=>{audio.pause();reject(new Error(`Playback timed out: ${url}`))},15000);
    audio.onended=()=>{clearTimeout(timer);resolve({source:url,duration:audio.duration,ended:audio.ended})};
    audio.onerror=()=>{clearTimeout(timer);reject(new Error(`Audio decode failed: ${url}`))};
    void audio.play().catch(error=>{clearTimeout(timer);reject(error)});
   });}finally{audio.pause();audio.removeAttribute('src');audio.load();}
  },source);
  expect(result.duration).toBeGreaterThan(0);expect(result.ended).toBe(true);results.push(result);
 }
 expect(results.length).toBeGreaterThanOrEqual(21);
 await testInfo.attach('real-browser-playback.json',{body:JSON.stringify(results,null,2),contentType:'application/json'});
});

for(const [index,language] of ['yo','ha','ig'].entries())test(`REAL ${language} prompts: language preview and first onboarding question`,async({page})=>{
 // Authentication is a test double; static recordings and media playback are real.
 const user={id:'00000000-0000-4000-8000-000000000001',is_anonymous:true,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}};
 await page.route('**/auth/v1/**',route=>route.fulfill({json:{access_token:'test-token',refresh_token:'test-refresh',expires_in:3600,token_type:'bearer',user}}));
 await page.route('**/api/me',route=>route.fulfill({json:{data:{user,profile:null,businesses:[]}}}));
 await page.goto('/start');
 await page.getByRole('button',{name:'Tap to Start',exact:true}).click();
 const welcome=page.waitForResponse(response=>response.url().endsWith(`/audio/${language}/welcome.mp3`));
 await page.getByRole('button',{name:`Hear ${language}`,exact:true}).click();
 expect((await welcome).ok()).toBe(true);
 const name=page.waitForResponse(response=>response.url().endsWith(`/audio/${language}/name.mp3`));
 await page.locator('.language-card').nth(index).locator('button').first().click();
 expect((await name).ok()).toBe(true);
 await expect(page.locator('main.voice-entry')).toHaveAttribute('lang',language);
 await expect(page.locator('main.voice-entry > p[role="status"]')).toHaveCount(0);
});
