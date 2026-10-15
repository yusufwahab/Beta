import {test,expect} from '@playwright/test';

for(const scenario of [
 {name:'anonymous trader',path:'/app/more',anonymous:true,admin:false},
 {name:'registered trader settings',path:'/app/settings',anonymous:false,admin:false},
 {name:'validation admin',path:'/admin/validation',anonymous:false,admin:true},
 {name:'account with unavailable business API',path:'/app',anonymous:false,admin:false,failure:true},
])test(`sign out returns ${scenario.name} to the landing page and clears the session`,async({page})=>{
 const id='00000000-0000-4000-8000-000000000088';
 const user={id,is_anonymous:scenario.anonymous,email_confirmed_at:scenario.anonymous?undefined:new Date().toISOString(),app_metadata:scenario.admin?{beta_validation_admin:true}:{},user_metadata:{},aud:'authenticated',role:'authenticated'};
 const token=`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.test`;
 await page.addInitScript(value=>{if(!sessionStorage.getItem('signout-fixture-initialized')){localStorage.setItem('sb-127-auth-token',JSON.stringify(value));sessionStorage.setItem('signout-fixture-initialized','true');}}, {access_token:token,refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user});
 let signouts=0;
 await page.route('**/auth/v1/**',async route=>{if(new URL(route.request().url()).pathname.endsWith('/logout')){signouts++;await route.fulfill({status:204});return;}await route.fulfill({json:{user,access_token:token,refresh_token:'fixture',expires_in:3600}});});
 await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;let data:unknown={enabled:false};if(path==='/api/me'){if(scenario.failure){await route.fulfill({status:500,json:{error:{message:'Explicit test database outage'}}});return;}data={user,profile:{trader_name:'Test trader',preferred_language:'en'},businesses:[{id,name:'Test business',category:'Food'}]};}else if(path.endsWith('/sessions'))data={sessions:[],total:0};else if(path.endsWith('/summary')){await route.fulfill({status:503,json:{error:{message:'Explicit test reporting outage'}}});return;}await route.fulfill({json:{data}});});
 await page.goto(scenario.path);await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await expect(page).toHaveURL(/\/$/);await expect.poll(()=>signouts).toBe(1);
 expect(await page.evaluate(()=>localStorage.getItem('sb-127-auth-token'))).toBeNull();
 await page.goto('/app/more');await expect(page).toHaveURL(/\/start$/);
});
