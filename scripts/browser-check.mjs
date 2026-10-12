import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const executable=process.env.BETA_BROWSER_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser=spawn(executable,['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9228',`--user-data-dir=${resolve('.browser-check')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let socket;
try{
 let targets;
 for(let i=0;i<30;i++){try{targets=await (await fetch('http://127.0.0.1:9228/json/list')).json();break}catch{await delay(500)}}
 assert.ok(targets,'Browser did not start');
 const target=targets.find(t=>t.type==='page');
 socket=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject});
 let counter=0;const pending=new Map();const errors=[];
 socket.onmessage=e=>{const data=JSON.parse(String(e.data));if(data.id){const pair=pending.get(data.id);pending.delete(data.id);data.error?pair?.reject(new Error(JSON.stringify(data.error))):pair?.resolve(data.result)}if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails.text)};
 socket.onclose=()=>{for(const pair of pending.values())pair.reject(new Error('Browser debugging connection closed'));pending.clear()};
 function call(method,params={}){return new Promise((resolve,reject)=>{const id=++counter;const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`Browser command timed out: ${method}`))},15000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});socket.send(JSON.stringify({id,method,params}))})}
 await call('Page.enable');await call('Runtime.enable');
 await mkdir('artifacts',{recursive:true});
 const origin=process.env.BETA_PREVIEW_URL??'http://127.0.0.1:5173';
 for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844],['small-mobile',320,740]]){
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:origin});await delay(1800);
  const data=await call('Runtime.evaluate',{expression:'JSON.stringify({width:innerWidth,scroll:document.documentElement.scrollWidth,heading:document.querySelector("h1")?.textContent,sections:document.querySelectorAll("section").length,buttons:document.querySelectorAll("a.btn-primary").length})',returnByValue:true});
  const values=JSON.parse(data.result.value);assert.equal(values.scroll,values.width,`${name} horizontal overflow`);assert.match(values.heading,/Your Business/);assert.ok(values.sections>=9);assert.ok(values.buttons>=5);
  const screenshot=await call('Page.captureScreenshot',{format:'png'});await writeFile(`artifacts/${name}.png`,Buffer.from(screenshot.data,'base64'));
  if(width===390){await call('Runtime.evaluate',{expression:'document.querySelector(".landing-nav .mobile-toggle").click()'});const open=await call('Runtime.evaluate',{expression:'document.querySelector(".nav-links").classList.contains("open")',returnByValue:true});assert.equal(open.result.value,true)}
  console.log(`${name}: rendered, sections/CTAs present, no horizontal overflow`);
 }
 await call('Page.navigate',{url:`${origin}/auth`});await delay(1800);
 const auth=await call('Runtime.evaluate',{expression:'document.body.innerText',returnByValue:true});assert.match(auth.result.value,/Welcome back/);assert.match(auth.result.value,/Authentication needs Supabase/);
 assert.deepEqual(errors,[]);console.log('Auth route: clear missing-configuration state; no uncaught browser errors');
}finally{socket?.close();browser.kill()}
