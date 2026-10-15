import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {journeySteps} from '../../packages/shared/dist/index.js';
// UI contract tests: Auth, ASR, TTS and persistence are explicit test doubles.
// Real PostgreSQL workflow and isolation coverage lives in http.integration.test.ts.
async function fixture(page:Page){
 const id='00000000-0000-4000-8000-000000000001';const user={id,is_anonymous:true,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}};
 const token=`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.test`;
 await page.addInitScript(session=>{
  if(!localStorage.getItem('sb-127-auth-token'))localStorage.setItem('sb-127-auth-token',JSON.stringify(session));
  HTMLMediaElement.prototype.play=async()=>{};
  Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}});
  class Recorder extends EventTarget{static isTypeSupported(){return true}state='inactive';mimeType='audio/webm';ondataavailable:any;onstop:any;start(){this.state='recording'}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['MOCK AUDIO'],{type:'audio/webm'})});this.onstop?.()}}
  Object.defineProperty(window,'MediaRecorder',{value:Recorder});
 },{access_token:token,refresh_token:'test',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user});
 const state={completed:[] as string[],skipped:[] as string[],known:[] as string[],paused:false,visits:0,dismissed:[] as string[]};
 const data={products:[] as any[],sales:[] as any[],speech:[] as string[],interpretDrafts:[] as any[],transcripts:['I sold three bags of rice at fifteen thousand naira each','No, I said two bags.'],revision:0,quantity:3,unit_price:'15000',productWrites:0,saleWrites:0};
 function guide(){return {state,step:journeySteps.find(step=>![...state.completed,...state.skipped,...state.known].includes(step))??null,recommendation:!journeySteps.some(step=>![...state.completed,...state.skipped,...state.known].includes(step))&&data.sales.length&&!state.dismissed.includes('expense:today')?{id:'expense:today',kind:'expense',amount:'30000.00'}:null};}
 function review(){return {response:'Review these details before confirming.',confirmation_id:`00000000-0000-4000-8000-${String(++data.revision).padStart(12,'0')}`,preview:{total:String(data.quantity*Number(data.unit_price))},command:{intent:'RECORD_SALE',entities:{product:'Rice',quantity:data.quantity,unit_price:data.unit_price}},review_fields:{product:'Rice',quantity:String(data.quantity),unit_price:data.unit_price,payment_status:'unknown',customer:'',paid_amount:''}};}
 await page.route('**/auth/v1/**',route=>route.fulfill({json:{access_token:token,refresh_token:'test',expires_in:3600,user}}));
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;const post=route.request().method()==='POST';const body=post&&!path.endsWith('/transcribe')?route.request().postDataJSON():{};let result:any=[];
  if(path==='/api/me')result={user,profile:{trader_name:'Mama Amina',preferred_language:'en'},businesses:[{id,name:'Amina Foodstuff',category:'Food'}]};
  else if(path.endsWith('/journey')){if(post){if(body.action==='visit')state.visits++;if(body.action==='pause')state.paused=true;if(body.action==='resume')state.paused=false;if(body.action==='skip')state.skipped.push(body.step);if(body.action==='known')state.known.push(body.step);if(body.action==='summary')state.completed.push('summary');if(body.action==='dismiss')state.dismissed.push(body.recommendation_id);}result=guide();}
  else if(path.endsWith('/analytics'))result={sales:{today:data.sales.length?'30000':'0',week:'0',month:'0',transactions:data.sales.length},expenses:{today:'0',month:'0'},debts:'0',estimated_profit:null,trends:[],low_stock:[],recent:[]};
  else if(path.endsWith('/products')){if(post){data.productWrites++;data.products.push({id,name:body.name,selling_price:body.selling_price,stock_quantity:body.stock_quantity,category:'Food',low_stock_threshold:5});state.completed.push('product');}result=post?data.products.at(-1):data.products;}
  else if(path==='/api/voice/onboarding/transcribe')result={text:'three',model:'NCAIR1/NigerianAccentedEnglish'};
  else if(path==='/api/voice/field/interpret')result={value:body.text==='two'?'2':body.text};
  else if(path.endsWith('/voice/transcribe'))result={id,transcript:data.transcripts.shift()??'I sold two bags of rice at fifteen thousand naira each'};
  else if(path.endsWith('/voice/interpret')){if(body.draft){data.interpretDrafts.push(body.draft);data.quantity=2;data.unit_price=body.draft.unit_price;}result={intent:'record_sale',items:[{product_name:'Rice',quantity:data.quantity,unit_price:data.unit_price}],payment_status:'unknown'};}
  else if(path.endsWith('/voice/command')){if(body.correction_of)data.quantity=2;result=review();}
  else if(path.endsWith('/voice/review')){expect(data.saleWrites).toBe(0);data.quantity=Number(body.edits.quantity);data.unit_price=body.edits.unit_price;result=review();}
  else if(path.endsWith('/voice/confirm')){expect(body.confirmed).toBe(true);data.saleWrites++;state.completed.push('sale');data.sales.push({id,total:String(data.quantity*Number(data.unit_price))});result=data.sales.at(-1);}
  else if(path.endsWith('/sales/preview'))result={total:String(body.items.reduce((sum:number,item:any)=>sum+item.quantity*Number(item.unit_price),0))};
  else if(path.endsWith('/sales')&&post){data.saleWrites++;state.completed.push('sale');result={id,total:String(body.items.reduce((sum:number,item:any)=>sum+item.quantity*Number(item.unit_price),0))};data.sales.push(result);}
  else if(path==='/api/voice/speak'){data.speech.push(body.text);await route.fulfill({contentType:'audio/mpeg',body:Buffer.from('MOCK TTS')});return;}
  else if(path.endsWith('/health'))result={natlas:{configured:true}};
  await route.fulfill({json:{data:result}});
 });
 return {state,data};
}

test('guided journey resumes after sale, supports editing and never saves skipped tasks',async({page})=>{
 const {state,data}=await fixture(page);await page.setViewportSize({width:390,height:844});await page.goto('/app');
 const guide=page.locator('.journey-guide');await expect(guide).toContainText('Welcome, Mama Amina.');await expect.poll(()=>data.speech.length).toBeGreaterThan(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'artifacts/beta-guided-dashboard-mobile.png'});
 await guide.getByRole('button',{name:'Add product',exact:true}).click();await page.locator('.page-heading').getByRole('button',{name:'Add product',exact:true}).click();
 const form=page.locator('form').first();await form.getByLabel('Product name',{exact:true}).fill('Rice');await form.getByLabel('Selling price',{exact:false}).fill('15000');await form.getByLabel('Opening stock',{exact:true}).fill('10');await form.getByRole('button',{name:'Add product',exact:true}).click();
 await expect(guide).toContainText('record your first sale');expect(data.productWrites).toBe(1);
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Home',exact:true}).click();
 const assistant=page.locator('.voice-assistant');await assistant.locator('.voice-orb').click();await assistant.locator('.voice-orb').click();await expect(assistant).toContainText('45,000');expect(data.saleWrites).toBe(0);
 await assistant.getByRole('button',{name:'Edit manually',exact:true}).click();await assistant.getByLabel('Quantity',{exact:true}).fill('2');expect(data.saleWrites).toBe(0);
 await assistant.getByRole('button',{name:'Review changes',exact:true}).click();await expect(assistant).toContainText('30,000');await assistant.locator('.voice-answer').screenshot({path:'artifacts/beta-editable-voice-review.png'});
 await assistant.getByRole('button',{name:'Confirm and save',exact:true}).click();await expect.poll(()=>data.saleWrites).toBe(1);await expect(guide).toContainText('record an expense next');
 await page.reload();await expect(guide).toContainText('Welcome back, Mama Amina. Last time we recorded your first sale.');
 await guide.getByRole('button',{name:'Pause guide',exact:true}).click();await page.reload();await expect(page.locator('.journey-paused')).toBeVisible();await page.getByRole('button',{name:'Resume guide',exact:true}).click();
 await guide.getByRole('button',{name:'Skip',exact:true}).click();await expect(guide).toContainText('customer owes');await guide.getByRole('button',{name:'I know how to do this',exact:true}).click();
 await guide.getByRole('button',{name:'View business summary',exact:true}).click();await expect(guide).toContainText('You’re all set.');await guide.getByRole('button',{name:'Continue',exact:true}).click();await expect(guide).toContainText('30,000 in sales today but no expenses');
 await guide.getByRole('button',{name:'Skip',exact:true}).click();await page.reload();await expect(guide).toHaveCount(0);expect(state.skipped).toContain('expense');expect(state.known).toContain('debt');expect(data.saleWrites).toBe(1);
});

test('voice-filled product values are editable and need a separate final confirmation',async({page})=>{
 const {data}=await fixture(page);await page.goto('/app/inventory');await page.locator('.page-heading').getByRole('button',{name:'Add product',exact:true}).click();
 const form=page.locator('form').first();await form.getByLabel('Product name',{exact:true}).fill('Rice');await form.getByLabel('Selling price',{exact:false}).fill('15000');
 await form.getByRole('button',{name:'Fill a field with voice',exact:true}).click();await form.getByLabel('Choose a field').selectOption('stock_quantity');await form.locator('.voice-orb').click();await form.locator('.voice-orb').click();
 await expect(form.getByLabel('Review the value')).toHaveValue('three');await form.getByLabel('Review the value').fill('two');await form.getByRole('button',{name:'Use this value',exact:true}).click();await expect(form.getByLabel('Opening stock',{exact:true})).toHaveValue('2');expect(data.productWrites).toBe(0);
 await form.getByRole('button',{name:'Review changes',exact:true}).click();await expect(form.locator('.record-review')).toBeVisible();expect(data.productWrites).toBe(0);
 await form.getByRole('button',{name:'Edit details',exact:true}).click();await form.getByLabel('Opening stock',{exact:true}).fill('4');await form.getByRole('button',{name:'Review changes',exact:true}).click();await form.getByRole('button',{name:'Confirm record',exact:true}).click();await expect.poll(()=>data.productWrites).toBe(1);expect(data.products[0].stock_quantity).toBe(4);
});

test('spoken correction reparses the draft and still requires confirmation',async({page})=>{
 const {data,state}=await fixture(page);state.completed.push('product');await page.goto('/app');const assistant=page.locator('.voice-assistant');
 await assistant.locator('.voice-orb').click();await assistant.locator('.voice-orb').click();await expect(assistant).toContainText('45,000');
 await assistant.getByRole('button',{name:'Correct with voice',exact:true}).click();await assistant.locator('.voice-orb').click();await assistant.locator('.voice-orb').click();await expect(assistant).toContainText('30,000');expect(data.saleWrites).toBe(0);
 await assistant.getByLabel('What Beta heard',{exact:true}).fill('I sold two bags of rice at fifteen thousand naira each');await expect(assistant.getByRole('button',{name:'Confirm and save',exact:true})).toBeDisabled();await assistant.getByRole('button',{name:'Interpret edited text',exact:true}).click();expect(data.saleWrites).toBe(0);
 await assistant.getByRole('button',{name:'Confirm and save',exact:true}).click();await expect.poll(()=>data.saleWrites).toBe(1);
});

test('guide speech does not play while the microphone is recording',async({page})=>{
 const {data}=await fixture(page);await page.goto('/app');await expect(page.locator('.journey-guide')).toBeVisible();const assistant=page.locator('.voice-assistant');await assistant.locator('.voice-orb').click();const before=data.speech.length;
 await page.locator('.journey-guide').getByRole('button',{name:'Hear again',exact:true}).click();
 // Allow the guide's delayed automatic narration to run while capture is active.
 await page.waitForTimeout(700);expect(data.speech.length).toBe(before);
 await assistant.locator('.voice-orb').click();await expect(assistant).toContainText('45,000');
});

test('checkout voice corrections preserve reviewed price and save only after final confirmation',async({page})=>{
 const {data,state}=await fixture(page);state.completed.push('product');data.products.push({id:'00000000-0000-4000-8000-000000000001',name:'Rice',selling_price:'15000',stock_quantity:10,category:'Food',low_stock_threshold:5,cost_price:null,archived:false});
 await page.goto('/app/checkout');await page.locator('.record-mic').click();await page.locator('.record-mic').click();await page.getByRole('button',{name:'Transcribe & interpret',exact:true}).click();
 await expect(page.getByLabel('Quantity',{exact:true})).toHaveValue('3');await page.getByLabel('Quantity',{exact:true}).fill('2');await page.getByLabel('Unit price',{exact:false}).fill('14000');
 await page.getByRole('button',{name:'Correct with voice',exact:true}).click();await page.locator('.record-mic').click();await page.getByRole('button',{name:'Transcribe & interpret',exact:true}).click();
 await expect(page.getByLabel('Quantity',{exact:true})).toHaveValue('2');await expect(page.getByLabel('Unit price',{exact:false})).toHaveValue('14000');expect(data.interpretDrafts[0]).toMatchObject({quantity:2,unit_price:'14000'});expect(data.saleWrites).toBe(0);
 await page.getByRole('button',{name:'Review sale',exact:true}).click();await expect(page.locator('.checkout-confirmation')).toContainText('28,000');expect(data.saleWrites).toBe(0);
 await page.getByRole('button',{name:'Edit details',exact:true}).click();await page.getByLabel('Quantity',{exact:true}).fill('1');await page.getByRole('button',{name:'Review sale',exact:true}).click();await expect(page.locator('.checkout-confirmation')).toContainText('14,000');
 await page.getByRole('button',{name:'Confirm sale',exact:true}).click();await expect.poll(()=>data.saleWrites).toBe(1);expect(data.sales[0].total).toBe('14000');
});

test('a failed correction leaves the microphone available and never saves',async({page})=>{
 const {data}=await fixture(page);await page.goto('/app');const assistant=page.locator('.voice-assistant');await assistant.locator('.voice-orb').click();await assistant.locator('.voice-orb').click();await expect(assistant).toContainText('45,000');
 await page.route('**/voice/command',route=>route.fulfill({status:503,json:{error:{message:'Correction is temporarily unavailable. Please try again.'}}}));
 await assistant.getByRole('button',{name:'Correct with voice',exact:true}).click();await assistant.locator('.voice-orb').click();await assistant.locator('.voice-orb').click();await expect(assistant.getByRole('alert')).toContainText('temporarily unavailable');await expect(assistant.locator('.voice-orb')).toBeEnabled();await expect(assistant.getByRole('button',{name:'Confirm and save',exact:true})).toHaveCount(0);expect(data.saleWrites).toBe(0);
});
