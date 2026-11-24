import {test,expect,Page,Route} from '@playwright/test';
const human={id:'human',name:'Alex',kind:'human',state:'active',availability:'available',isAdmin:true};
const agent={id:'agent-123456',name:'Alex',kind:'agent',state:'active',availability:'unknown',isAdmin:false};
const token={id:'token',label:'Connector',state:'active',createdAt:'2026-01-01T00:00:00Z',lastUsedAt:null,revokedAt:null};
const snapshot=(state='active',pendingCount=2,id='token')=>[{agent,tokens:[{...token,state,id}],pendingCount}];
async function setup(page:Page,clock=false,open=true){
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/status'))return route.fulfill({json:{requiresBootstrap:false,registrationAvailable:false}});
  if(path.endsWith('/me'))return route.fulfill({json:{id:'account',participantId:human.id,displayName:'Alex',isAdmin:true}});
  if(path.endsWith('/csrf'))return route.fulfill({json:{token:'csrf'}});
  if(path.endsWith('/home'))return route.fulfill({json:{participants:[human,agent],conversation:{id:'main',title:'Main',kind:'main',participantIds:[human.id,agent.id]},conversations:[],messages:[]}});
  if(path==='/api/admin/agents'&&route.request().method()==='GET')return route.fulfill({json:snapshot()});
  if(route.request().method()==='POST')return route.fulfill({json:{agent,token:{...token,id:'new'},rawToken:'review-one-time-secret'}});
  return route.fulfill({json:[]});
 });
 await page.goto('/');await expect(page.getByRole('button',{name:'Manage agents',exact:true})).toBeVisible();if(clock)await page.clock.install();if(open){await page.getByRole('button',{name:'Manage agents',exact:true}).click();await expect(page.getByText('Pending replies: 2')).toBeVisible();}
}
async function issue(page:Page,action:string){
 if(action==='create'){
  await page.getByRole('button',{name:'Create agent',exact:true}).click();await expect(page.getByLabel('Agent display name')).toBeFocused();
  await page.getByLabel('Agent display name').fill('Helper');await page.getByLabel('Token label').fill('Connector');await page.getByRole('button',{name:'Create',exact:true}).click();
 }else{
  await page.getByRole('button',{name:action==='revoke'?'Revoke token':'Replace token',exact:true}).click();
  await expect(page.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();await page.getByRole('button',{name:`Confirm ${action}`,exact:true}).click();
 }
}
for(const action of ['create','replace'])for(const dismissal of ['Done','Escape'])test(`delayed reveal ${action} ${dismissal} is actionable without metadata`,async({page})=>{
 await setup(page);let held:Route|undefined;
 await page.route('**/api/admin/agents',async route=>{if(route.request().method()==='GET'){held=route;return;}return route.fallback();});
 await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('denied'))}});});
 await issue(page,action);const reveal=page.getByRole('dialog',{name:'Save integration token'});
 await expect(reveal.getByLabel('Integration token')).toBeFocused();await expect(reveal).toHaveAttribute('aria-busy','false');await expect.poll(()=>!!held).toBe(true);
 await reveal.getByRole('button',{name:'Copy token',exact:true}).click();await expect(reveal.getByRole('alert')).toContainText('Copy failed');await expect(reveal.getByLabel('Integration token')).toHaveValue('review-one-time-secret');
 if(dismissal==='Done')await reveal.getByRole('button',{name:'Done',exact:true}).click();else await page.keyboard.press('Escape');
 await expect(reveal).toHaveCount(0);await expect(page.getByRole('button',{name:action==='create'?'Create agent':'Replace token',exact:true})).toBeFocused();await expect(page.locator('input[value="review-one-time-secret"]')).toHaveCount(0);
 await held!.fulfill({json:snapshot()});await page.getByRole('button',{name:'Close manage agents',exact:true}).click();await page.getByRole('button',{name:'Manage agents',exact:true}).click();await expect(reveal).toHaveCount(0);await page.reload();await expect(reveal).toHaveCount(0);
});
for(const action of ['create','revoke','replace','pending-count'])test(`stale poll cannot overwrite ${action} refresh`,async({page})=>{
 await setup(page,true);let old:Route|undefined;let gets=0;
 await page.route('**/api/admin/agents',async route=>{
  if(route.request().method()!=='GET')return route.fallback();
  if(++gets===1){old=route;return;}
  return route.fulfill({json:snapshot(action==='revoke'?'revoked':'active',9,'new').map(s=>({...s,tokens:s.tokens.map(t=>({...t,label:'New connector'}))}))});
 });
 await page.clock.runFor(5000);await expect.poll(()=>!!old).toBe(true);
 await issue(page,action==='pending-count'?'create':action);
 if(action!=='revoke'){const reveal=page.getByRole('dialog',{name:'Save integration token'});await expect(reveal.getByLabel('Integration token')).toBeFocused();await reveal.getByRole('button',{name:'Done',exact:true}).click();}
 await expect(page.getByText('Pending replies: 9')).toBeVisible();
 const completed=page.waitForResponse(response=>response.url().endsWith('/api/admin/agents')&&response.request().method()==='GET');
 await old!.fulfill({json:snapshot('active',2)});await (await completed).finished();
 // Network completion followed by a render barrier, not a timing sleep.
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 await expect(page.getByText('Pending replies: 9')).toBeVisible();await expect(page.getByText('Pending replies: 2')).toHaveCount(0);await expect(page.getByText('New connector ·',{exact:false})).toBeVisible();await expect(page.getByText('Connector · active',{exact:true})).toHaveCount(0);
 if(action==='revoke')await expect(page.getByRole('button',{name:'Revoke token',exact:true})).toBeDisabled();
});
test('create field errors have accessible associations and first-invalid focus',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'Create agent',exact:true}).click();await expect(page.getByLabel('Agent display name')).toBeFocused();
 const submit=page.getByRole('button',{name:'Create',exact:true});await submit.click();
 for(const name of ['Agent display name','Token label']){const field=page.getByLabel(name,{exact:true});await expect(field).toHaveAttribute('aria-invalid','true');const id=await field.getAttribute('aria-describedby');expect(id).toBeTruthy();await expect(page.locator(`#${id}`)).toContainText('required');}
 await expect(page.getByLabel('Agent display name')).toBeFocused();
 await page.getByLabel('Agent display name').fill('x'.repeat(101));await page.getByLabel('Description',{exact:true}).fill('x'.repeat(161));await page.getByLabel('Token label').fill('x'.repeat(101));await submit.click();
 for(const name of ['Agent display name','Description','Token label']){const field=page.getByLabel(name,{exact:true});await expect(field).toHaveAttribute('aria-invalid','true');await expect(page.locator(`#${await field.getAttribute('aria-describedby')}`)).toContainText('at most');}
 await expect(page.getByLabel('Agent display name')).toBeFocused();await page.getByLabel('Agent display name').fill('Valid');await submit.click();await expect(page.getByLabel('Description',{exact:true})).toBeFocused();
});
for(const action of ['revoke','replace'])for(const status of [409,403,401,503,0])test(`${action} recovers safely from ${status}`,async({page})=>{
 await setup(page);await page.route(action==='revoke'?'**/api/admin/integration-tokens/*/revoke':'**/api/admin/agents/*/tokens',route=>status===0?route.abort('failed'):route.fulfill({status,json:{detail:status===409?'Token state changed. Refresh and retry.':status===403?'Administrator access required.':'Operation rejected.'}}));
 await issue(page,action);
 if(status===401){await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();return;}
 const dialog=page.getByRole('dialog',{name:action==='revoke'?'Revoke token?':'Replace token?'});await expect(dialog.getByRole('alert')).toBeVisible();await expect(dialog.getByRole('button',{name:`Confirm ${action}`,exact:true})).toBeEnabled();await expect(page.getByLabel('Integration token',{exact:true})).toHaveCount(0);
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.getByRole('button',{name:action==='revoke'?'Revoke token':'Replace token',exact:true})).toBeFocused();
 await page.unroute(action==='revoke'?'**/api/admin/integration-tokens/*/revoke':'**/api/admin/agents/*/tokens');await issue(page,action);
 if(action==='replace')await expect(page.getByLabel('Integration token',{exact:true})).toHaveValue('review-one-time-secret');else await expect(page.getByRole('dialog',{name:'Manage agents',exact:true}).getByRole('status')).toContainText('Token revoked');
});
for(const status of [401,503])test(`replacement secret survives metadata ${status} until explicit dismissal`,async({page})=>{
 await setup(page);await page.route('**/api/admin/agents',route=>route.request().method()==='GET'?route.fulfill({status,json:{detail:'Session expired.'}}):route.fallback());
 await issue(page,'replace');const reveal=page.getByRole('dialog',{name:'Save integration token'});await expect(reveal.getByLabel('Integration token')).toHaveValue('review-one-time-secret');await expect(reveal.getByRole('alert')).toBeVisible();await reveal.getByRole('button',{name:'Done',exact:true}).click();await expect(reveal).toHaveCount(0);await page.reload();await expect(reveal).toHaveCount(0);
});
test('in-flight workspace write cannot discard a revealed replacement secret',async({page})=>{
 await setup(page,false,false);let held:Route|undefined;
 await page.route('**/api/conversations/main/messages',route=>{held=route;});
 await page.getByLabel('Message the Common Room',{exact:true}).fill('Pending workspace message');await page.getByRole('button',{name:'Send',exact:true}).click();await expect.poll(()=>!!held).toBe(true);
 await page.getByRole('button',{name:'Manage agents',exact:true}).click();await expect(page.getByText('Pending replies: 2')).toBeVisible();await issue(page,'replace');
 const reveal=page.getByRole('dialog',{name:'Save integration token'});await expect(reveal.getByLabel('Integration token')).toBeFocused();await held!.fulfill({status:401,json:{detail:'Session expired.'}});
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await expect(reveal.getByLabel('Integration token')).toHaveValue('review-one-time-secret');await expect(reveal.getByRole('alert')).toContainText('Save this one-time token');await reveal.getByRole('button',{name:'Done',exact:true}).click();await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
});
test('workspace poll cannot discard a revealed replacement secret',async({page})=>{
 await setup(page,false,false);let held:Route|undefined;
 await page.route('**/api/workspace/home',route=>{held=route;});
 await expect.poll(()=>!!held,{timeout:15000}).toBe(true);
 await page.getByRole('button',{name:'Manage agents',exact:true}).click();await expect(page.getByText('Pending replies: 2')).toBeVisible();await issue(page,'replace');
 const reveal=page.getByRole('dialog',{name:'Save integration token'});await expect(reveal.getByLabel('Integration token')).toBeFocused();await held!.fulfill({status:401,json:{detail:'Session expired.'}});
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await expect(reveal.getByLabel('Integration token')).toHaveValue('review-one-time-secret');await reveal.getByRole('button',{name:'Done',exact:true}).click();await expect(reveal).toHaveCount(0);
});
test('poll session transition cannot interrupt pending replacement issuance',async({page})=>{
 await setup(page,true);let issuance:Route|undefined;let posts=0;
 await page.route('**/api/admin/agents/*/tokens',route=>{posts++;issuance=route;});
 await page.route('**/api/admin/agents',route=>route.fulfill({status:401,json:{detail:'Session expired.'}}));
 await issue(page,'replace');const confirmation=page.getByRole('dialog',{name:'Replace token?'});await expect(confirmation).toBeFocused();await expect.poll(()=>!!issuance).toBe(true);
 await page.clock.runFor(5000);await expect(confirmation).toBeVisible();await page.keyboard.press('Escape');await expect(confirmation).toBeVisible();await expect(confirmation.getByRole('button',{name:'Saving…'})).toBeDisabled();expect(posts).toBe(1);
 await issuance!.fulfill({json:{token,rawToken:'review-one-time-secret'}});const reveal=page.getByRole('dialog',{name:'Save integration token'});await expect(reveal.getByLabel('Integration token')).toHaveValue('review-one-time-secret');await expect(reveal.getByRole('alert')).toContainText('Save this one-time token');await reveal.getByRole('button',{name:'Done',exact:true}).click();await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
});
test('polling error clears after authoritative mutation refresh',async({page})=>{
 await setup(page,true);let gets=0;
 await page.route('**/api/admin/agents',route=>route.request().method()!=='GET'?route.fallback():++gets===1?route.fulfill({status:503,json:{}}):route.fulfill({json:snapshot('revoked',9)}));
 await page.clock.runFor(5000);await expect(page.getByRole('alert')).toContainText('unavailable');await page.clock.runFor(5000);await expect(page.getByText('Pending replies: 9')).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);await issue(page,'replace');await page.getByRole('dialog',{name:'Save integration token'}).getByRole('button',{name:'Done',exact:true}).click();await expect(page.getByText('Pending replies: 9')).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);
});
for(const action of ['revoke','create','replace'])for(const succeeds of [true,false])for(const dismissal of (action!=='revoke'&&succeeds?['Done','Escape']:['settle']))test(`deferred expiry ${action} ${succeeds?'success':'failure'} ${dismissal}`,async({page})=>{
 await setup(page,false,false);let workspace:Route|undefined,mutation:Route|undefined;let posts=0;
 await page.route('**/api/conversations/main/messages',route=>{workspace=route;});
 await page.getByLabel('Message the Common Room',{exact:true}).fill('Pending');await page.getByRole('button',{name:'Send',exact:true}).click();await expect.poll(()=>!!workspace).toBe(true);
 await page.getByRole('button',{name:'Manage agents',exact:true}).click();await expect(page.getByText('Pending replies: 2')).toBeVisible();
 const endpoint=action==='create'?'**/api/admin/agents':action==='replace'?'**/api/admin/agents/*/tokens':'**/api/admin/integration-tokens/*/revoke';
 await page.route(endpoint,route=>{if(route.request().method()!=='POST')return route.fallback();posts++;mutation=route;});
 await issue(page,action);await expect.poll(()=>!!mutation).toBe(true);
 await workspace!.fulfill({status:401,json:{detail:'Session expired.'}});
 await expect(page.getByRole('alert')).toContainText('session expired');await expect(page.getByRole('alert')).not.toContainText('Save this one-time token');
 await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:action==='create'?'Creating…':'Saving…',exact:true})).toBeDisabled();
 // Exercise the outer handler directly as well as the inert/focus boundary.
 await page.getByRole('button',{name:'Close manage agents',exact:true,includeHidden:true}).evaluate((el:HTMLButtonElement)=>el.click());
 await expect(page.getByRole('heading',{name:'Welcome back'})).toHaveCount(0);expect(posts).toBe(1);
 await mutation!.fulfill(succeeds?{json:{token,rawToken:'review-one-time-secret'}}:{status:503,json:{detail:'Failed before issuance.'}});
 if(action!=='revoke'&&succeeds){const reveal=page.getByRole('dialog',{name:'Save integration token'});await expect(reveal.getByLabel('Integration token')).toHaveValue('review-one-time-secret');await expect(reveal.getByRole('alert')).toContainText('Save this one-time token');await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('denied'))}});});await reveal.getByRole('button',{name:'Copy token',exact:true}).click();await expect(reveal.getByRole('alert')).toContainText('Copy failed');await expect(reveal.getByRole('alert')).toContainText('Save this one-time token');await page.getByRole('button',{name:'Close manage agents',exact:true,includeHidden:true}).evaluate((el:HTMLButtonElement)=>el.click());await expect(reveal).toBeVisible();if(dismissal==='Done')await reveal.getByRole('button',{name:'Done',exact:true}).click();else await page.keyboard.press('Escape');}
 await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();expect(posts).toBe(1);
});
test('replacement conflict authoritatively rebinds token A to B and issues C once',async({page})=>{
 await setup(page,true);let current='token',held:Route|undefined;const sent:string[]=[];let gets=0;
 await page.route('**/api/admin/agents',route=>{if(route.request().method()!=='GET')return route.fallback();if(++gets===1){held=route;return;}return route.fulfill({json:snapshot('active',2,current)});});
 await page.clock.runFor(5000);await expect.poll(()=>!!held).toBe(true);
 await page.getByRole('button',{name:'Replace token',exact:true}).click();await expect(page.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();current='B';
 await page.route('**/api/admin/agents/*/tokens',route=>{const id=route.request().postDataJSON().expectedTokenId;sent.push(id);if(id!==current)return route.fulfill({status:409,json:{detail:'Token state changed. Refresh and retry.'}});current='C';return route.fulfill({json:{token:{...token,id:'C'},rawToken:'token-C-secret'}});});
 await page.getByRole('button',{name:'Confirm replace',exact:true}).click();
 await expect.poll(()=>gets).toBe(2);await expect(page.getByRole('alert')).toContainText('review');
 const completed=page.waitForResponse(r=>r.url().endsWith('/api/admin/agents')&&r.request().method()==='GET');await held!.fulfill({json:snapshot()});await (await completed).finished();await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 await expect(page.getByRole('button',{name:'Confirm replace',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Confirm replace',exact:true}).click();await expect(page.getByLabel('Integration token',{exact:true})).toHaveValue('token-C-secret');expect(sent).toEqual(['token','B']);expect(current).toBe('C');
});
for(const status of [401,403,404,200,'missing-token'] as const)test(`replacement conflict refresh fails closed on ${status}`,async({page})=>{
 await setup(page);let recovery:Route|undefined;let posts=0;
 await page.route('**/api/admin/agents',route=>{if(route.request().method()!=='GET')return route.fallback();recovery=route;});
 await page.route('**/api/admin/agents/*/tokens',route=>{posts++;return route.fulfill({status:409,json:{detail:'Token changed.'}});});
 await issue(page,'replace');await expect.poll(()=>!!recovery).toBe(true);const confirmation=page.getByRole('dialog',{name:'Replace token?'});
 await expect(confirmation.getByRole('button',{name:'Saving…'})).toBeDisabled();await page.keyboard.press('Escape');await expect(confirmation).toBeVisible();expect(posts).toBe(1);
 await recovery!.fulfill(status==='missing-token'?{json:snapshot().map(s=>({...s,tokens:[]}))}:status===200?{json:[]}:{status,json:{detail:status===401?'Session expired.':status===403?'Administrator access required.':'Agent not found.'}});
 await expect(confirmation).toHaveCount(0);await expect(page.getByRole('button',{name:'Confirm replace',exact:true})).toHaveCount(0);
 if(status===401)await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();else{await expect(page.getByRole('alert')).toBeVisible();if(status!=='missing-token')await expect(page.getByRole('button',{name:'Replace token',exact:true})).toHaveCount(0);}expect(posts).toBe(1);
});
test('corrected fields clear only their stale validation associations',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'Create agent',exact:true}).click();await expect(page.getByLabel('Agent display name')).toBeFocused();
 await page.getByLabel('Description',{exact:true}).fill('x'.repeat(161));await page.getByRole('button',{name:'Create',exact:true}).click();
 const name=page.getByLabel('Agent display name'),description=page.getByLabel('Description',{exact:true}),label=page.getByLabel('Token label',{exact:true});
 for(const field of [name,description,label])await expect(field).toHaveAttribute('aria-invalid','true');
 await name.fill('Valid');await expect(name).not.toHaveAttribute('aria-invalid');await expect(name).not.toHaveAttribute('aria-describedby');await expect(page.locator('#agent-displayName-error')).toHaveCount(0);
 for(const field of [description,label])await expect(field).toHaveAttribute('aria-invalid','true');
 await description.fill('x'.repeat(162));await expect(page.locator('#agent-description-error')).toContainText('at most 160');
 await description.fill('Valid');await label.fill('Connector');for(const field of [name,description,label]){await expect(field).not.toHaveAttribute('aria-invalid');await expect(field).not.toHaveAttribute('aria-describedby');}await expect(page.getByRole('alert')).toHaveCount(0);
});
test('narrow mobile Manage Agents has usable controls without overflow',async({page})=>{
 await page.setViewportSize({width:320,height:700});await setup(page);await expect(page.getByRole('button',{name:'Replace token',exact:true})).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await issue(page,'create');const reveal=page.getByRole('dialog',{name:'Save integration token'});await expect(reveal.getByRole('button',{name:'Done',exact:true})).toBeInViewport();expect(await reveal.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});
