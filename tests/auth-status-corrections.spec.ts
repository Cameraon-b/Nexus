import { test, expect } from '@playwright/test';

for (const open of [true, false]) for (const phase of ['home', 'room', 'logout']) test(`current registration ${open ? 'open' : 'closed'} after ${phase} expiry`, async ({page}) => {
 let expired = false; let reads = 0;
 const user = {id:'u',email:'fixture@example.test',displayName:'Fixture',participantId:'p',isAdmin:true};
 await page.route('**/api/**', route => {
  const path = new URL(route.request().url()).pathname;
  if (path.endsWith('/status')) { reads++; return route.fulfill({json:{requiresBootstrap:false,registrationAvailable:expired ? open : !open}}); }
  if (path.endsWith('/csrf')) return route.fulfill({json:{token:'fixture'}});
  if (path.endsWith('/logout')) { expired = true; return route.fulfill({status:204}); }
  if (path.endsWith('/me')) return route.fulfill({status:expired?401:200,json:user});
  if (path.endsWith('/home')) {
   if (phase === 'home' || expired) { expired=true; return route.fulfill({status:401,json:{title:'Session expired'}}); }
   return route.fulfill({json:{participants:[{id:'p',name:'Fixture',kind:'human',state:'active'}],conversation:{id:'main',title:'The Common Room',description:'Shared',participantIds:['p']},messages:[]}});
  }
  if (expired) return route.fulfill({status:401,json:{title:'Session expired'}});
  return route.fulfill({json:[]});
 });
 await page.goto('/');
 if (phase !== 'home') {
  await expect(page.getByRole('heading',{name:'The Common Room'})).toBeVisible();
  if (phase === 'logout') await page.getByRole('button',{name:'Sign out'}).click();
  else expired=true;
 }
 await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible({timeout:10000});
 expect(reads).toBeGreaterThan(1);
 await expect(page.getByRole('tab',{name:'Create account'})).toHaveCount(open?1:0);
});

for (const newer of ['closed', 'unavailable']) for (const staleBootstrap of [false, true]) test(`stale ${staleBootstrap?'bootstrap':'registration'} cannot replace newer ${newer} status`, async ({page}) => {
 const deferred = () => { let resolve!:()=>void; const promise=new Promise<void>(r=>{resolve=r;}); return {promise,resolve}; };
 const logoutStarted=deferred(),logoutGate=deferred(),olderStarted=deferred(),olderGate=deferred(),newerStarted=deferred();
 let phase:'initial'|'older'|'newer'='initial'; let olderReads=0; let newerReads=0;
 // Model a transport that completes despite cancellation, so the stale result really
 // reaches the caller. No StrictMode request count or duplicate effect is assumed.
 await page.addInitScript(() => {
  const original=window.fetch.bind(window);
  const proof=window as unknown as {staleAuthStatusConsumedByParser:number};
  proof.staleAuthStatusConsumedByParser=0;
  window.fetch=async (input,init) => {
   const status=String(input).includes('/auth/status');
   const response=await original(input,status?{...init,signal:undefined}:init);
   if(status&&response.headers.get('x-test-status')==='older') {
    const json=response.json.bind(response);
    response.json=async () => new Proxy(await json(),{
     get(target,field,receiver) {
      // Only the decoder's consumer (parseAuthStatus), not fetch/json resolution,
      // reads these fields. Its abort guard follows in the same synchronous turn.
      if(field==='requiresBootstrap'||field==='registrationAvailable')proof.staleAuthStatusConsumedByParser++;
      return Reflect.get(target,field,receiver);
     }
    });
   }
   return response;
  };
 });
 await page.clock.install();
 const user={id:'u',email:'fixture@example.test',displayName:'Fixture',participantId:'p',isAdmin:true};
 await page.route('**/api/**', async route => {
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/status')) {
   const startedPhase=phase;
   if(startedPhase==='older') { olderReads++; olderStarted.resolve(); await olderGate.promise; }
   if(startedPhase==='newer') { newerReads++; newerStarted.resolve(); }
   return route.fulfill({headers:{'x-test-status':startedPhase},json:startedPhase==='older'
    ?{requiresBootstrap:staleBootstrap,registrationAvailable:!staleBootstrap}
    :startedPhase==='newer'&&newer==='unavailable'?{requiresBootstrap:'invalid',registrationAvailable:true}
    :{requiresBootstrap:false,registrationAvailable:false}});
  }
  if(path.endsWith('/csrf'))return route.fulfill({json:{token:'fixture'}});
  if(path.endsWith('/logout')) { logoutStarted.resolve(); await logoutGate.promise; return route.fulfill({status:204}); }
  if(path.endsWith('/me'))return route.fulfill({json:user});
  if(path.endsWith('/home'))return phase==='initial'
   ?route.fulfill({json:{participants:[{id:'p',name:'Fixture',kind:'human',state:'active'}],conversation:{id:'main',title:'The Common Room',description:'Shared',participantIds:['p']},messages:[]}})
   :route.fulfill({status:401,json:{title:'Session expired'}});
  return route.fulfill({json:[]});
 });
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'The Common Room'})).toBeVisible();
 // A completed initial status established the session. Keep sign-out in flight,
 // then expire the room through its real polling transition using virtual time.
 await page.getByRole('button',{name:'Sign out'}).click();
 await logoutStarted.promise;
 phase='older'; await page.clock.runFor(5000); await olderStarted.promise;
 expect(olderReads).toBe(1);
 phase='newer'; logoutGate.resolve(); await newerStarted.promise;
 const heading=page.getByRole('heading',{name:newer==='closed'?'Welcome back':'Workspace unavailable'});
 await expect(heading).toBeVisible(); expect(newerReads).toBe(1);
 olderGate.resolve();
 // parseAuthStatus field access and its subsequent abort guard run synchronously
 // in the resumed continuation. Observing this signal on the next Playwright task
 // therefore crosses consumption + guard, not merely fetch/JSON completion.
 await page.waitForFunction(()=>(window as unknown as {staleAuthStatusConsumedByParser:number}).staleAuthStatusConsumedByParser>0);
 await expect(heading).toBeVisible();
 await expect(page.getByRole('button',{name:'Create workspace'})).toHaveCount(0);
 await expect(page.getByRole('tab',{name:'Create account'})).toHaveCount(0);
});

for (const value of ['false', 'true', 1, null]) test(`malformed bootstrap ${JSON.stringify(value)} fails closed`, async ({page}) => {
 await page.route('**/api/**', route => route.fulfill({json:{requiresBootstrap:value,registrationAvailable:true}}));
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Workspace unavailable'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Create workspace'})).toHaveCount(0);
 await expect(page.getByRole('tab',{name:'Create account'})).toHaveCount(0);
});
