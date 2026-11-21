import {test,expect,Page} from '@playwright/test';
const human={id:'human',name:'Alex',kind:'human',state:'active',availability:'available',isAdmin:true};
const agent={id:'agent-123456',name:'Alex',kind:'agent',state:'active',availability:'unknown',description:'Test connector',isAdmin:false};
const main={id:'main',title:'The Common Room',kind:'main',state:'active',participantIds:[human.id,agent.id]};
const token={id:'token',label:'Connector',state:'active',createdAt:'2026-01-01T00:00:00Z',lastUsedAt:null,revokedAt:null};
async function fixture(page:Page,admin=true){
 let created=false;let active=true;
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname,post=route.request().method()==='POST';
  if(path.endsWith('/status'))return route.fulfill({json:{requiresBootstrap:false}});
  if(path.endsWith('/me'))return route.fulfill({json:{id:'account',participantId:human.id,displayName:human.name,isAdmin:admin}});
  if(path.endsWith('/csrf'))return route.fulfill({json:{token:'csrf-fixture'}});
  if(path.endsWith('/home'))return route.fulfill({json:{participants:[human,agent],conversation:main,conversations:[main],messages:[]}});
  if(path==='/api/admin/agents'&&post){expect(route.request().headers()['x-csrf-token']).toBe('csrf-fixture');created=true;return route.fulfill({json:{agent,token,rawToken:'one-time-test-token'}});}
  if(path==='/api/admin/agents')return route.fulfill({json:created?[{agent,tokens:[{...token,state:active?'active':'revoked'}],pendingCount:2}]:[]});
  if(path.endsWith('/revoke')){active=false;return route.fulfill({status:204});}
  if(path.endsWith('/tokens')&&post){active=true;return route.fulfill({json:{token:{...token,id:'replacement'},rawToken:'replacement-test-token'}});}
  if(path==='/api/conversations/direct')return route.fulfill({json:{id:'dm',title:agent.name,kind:'direct',state:'active',participantIds:[human.id,agent.id]}});
  if(path.endsWith('/messages'))return route.fulfill({json:[]});
  return route.fulfill({status:404});
 });
 await page.goto('/');
}
test('admin creates agent with accessible modal lifecycle and one-time reveal; confirms revoke and replacement',async({page})=>{
 await fixture(page);
 const trigger=page.getByRole('button',{name:'Manage agents',exact:true});await trigger.click();
 await page.getByRole('button',{name:'Create agent',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Create agent',exact:true});
 await expect(page.getByLabel('Agent display name')).toBeFocused();await expect(page.locator('.workspace-surface')).toHaveAttribute('inert','');
 const createButton=page.getByRole('button',{name:'Create',exact:true});await createButton.focus();await page.keyboard.press('Tab');await expect(page.getByLabel('Agent display name')).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(createButton).toBeFocused();
 await createButton.click();await expect(dialog).toBeVisible();
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'Create agent',exact:true})).toBeFocused();
 await page.getByRole('button',{name:'Create agent',exact:true}).click();
 await expect(page.getByLabel('Agent display name')).toBeFocused();await page.getByLabel('Agent display name').fill('Alex');await page.getByLabel('Description', {exact:true}).fill('Test connector');await page.getByLabel('Token label').fill('Connector');
 await page.getByRole('button',{name:'Create',exact:true}).click();
 const reveal=page.getByRole('dialog',{name:'Save integration token'});await expect(reveal).toBeVisible();await expect(reveal).toContainText('will not be shown again');await expect(reveal.getByLabel('Integration token')).toHaveValue('one-time-test-token');
 await page.keyboard.press('Tab');expect(await reveal.evaluate(n=>n.contains(document.activeElement))).toBe(true);
 expect(await page.evaluate(()=>[localStorage.length,sessionStorage.length])).toEqual([0,0]);
 await page.context().grantPermissions(['clipboard-read','clipboard-write']);await page.getByRole('button',{name:'Copy token',exact:true}).click();await expect(reveal.getByRole('status')).toHaveText('Token copied.');expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe('one-time-test-token');
 await page.getByRole('button',{name:'Done',exact:true}).click();await expect(reveal).toHaveCount(0);await expect(page.getByText('one-time-test-token')).toHaveCount(0);
 await expect(page.getByText('Pending replies: 2')).toBeVisible();
 await page.getByRole('button',{name:'Revoke token',exact:true}).click();await expect(page.getByRole('dialog',{name:'Revoke token?'})).toBeVisible();await page.getByRole('button',{name:'Confirm revoke',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Token revoked'})).toBeVisible();
 await page.getByRole('button',{name:'Replace token',exact:true}).click();await page.getByRole('button',{name:'Confirm replace',exact:true}).click();await expect(reveal.getByLabel('Integration token')).toHaveValue('replacement-test-token');
 await page.reload();await expect(reveal).toHaveCount(0);await expect(page.getByText('replacement-test-token')).toHaveCount(0);
});
test('pending create keeps focus inside guarded dialog until explicit completion',async({page})=>{
 await fixture(page);let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let reached=false;
 await page.route('**/api/admin/agents',async route=>{if(route.request().method()!=='POST')return route.fulfill({json:[]});reached=true;await gate;return route.fulfill({json:{agent,token,rawToken:'pending-test-token'}});});
 await page.getByRole('button',{name:'Manage agents',exact:true}).click();await page.getByRole('button',{name:'Create agent',exact:true}).click();await expect(page.getByLabel('Agent display name')).toBeFocused();await page.getByLabel('Agent display name').fill('Helper');await page.getByLabel('Token label').fill('Test');await page.getByRole('button',{name:'Create',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Create agent',exact:true});
 try{await expect.poll(()=>reached).toBe(true);await expect(dialog).toBeFocused();await page.keyboard.press('Escape');await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:'Cancel',exact:true})).toBeDisabled();await page.keyboard.press('Tab');await expect(dialog).toBeFocused();}finally{release();}
 await expect(page.getByRole('dialog',{name:'Save integration token'}).getByLabel('Integration token')).toBeFocused();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Create agent',exact:true})).toBeFocused();await expect(page.getByLabel('Integration token',{exact:true})).toHaveCount(0);
});
test('admin failures preserve safe retry and cancel focus without leaking token state',async({page})=>{
 await fixture(page);await page.getByRole('button',{name:'Manage agents',exact:true}).click();
 await page.route('**/api/admin/agents',async route=>{if(route.request().method()==='POST')return route.fulfill({status:503,json:{title:'internal-token-should-not-render'}});return route.fulfill({json:[]});});
 const create=page.getByRole('button',{name:'Create agent',exact:true});await create.click();
 const dialog=page.getByRole('dialog',{name:'Create agent',exact:true});
 await expect(page.getByLabel('Agent display name')).toBeFocused();await page.getByLabel('Agent display name').fill(' ');await page.getByLabel('Token label').fill('Connector');await dialog.getByRole('button',{name:'Create',exact:true}).click();await expect(page.locator('#agent-displayName-error')).toHaveText('Display name is required.');await expect(page.getByLabel('Agent display name')).toBeFocused();
 await page.getByLabel('Agent display name').fill('Helper');await dialog.getByRole('button',{name:'Create',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('server is unavailable');await expect(dialog).not.toContainText('internal-token-should-not-render');
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(create).toBeFocused();
 await page.getByRole('button',{name:'Close manage agents',exact:true}).click();await expect(page.getByRole('button',{name:'Manage agents',exact:true})).toBeFocused();
});
test('ordinary human sees honest agent picker identity and canonical mobile context but no admin surface',async({page})=>{
 await page.setViewportSize({width:390,height:844});await fixture(page,false);
 await expect(page.getByRole('button',{name:'Manage agents'})).toHaveCount(0);
 await page.getByRole('button',{name:'Direct messages',exact:true}).click();await page.getByRole('button',{name:'New message',exact:true}).click();
 const recipient=page.getByLabel('Recipient');await expect(recipient.locator('option').filter({hasText:'AGENT'})).toContainText('unknown');
 const posted=page.waitForRequest(request=>request.url().endsWith('/api/conversations/direct')&&request.method()==='POST');
 await recipient.selectOption(agent.id);await page.getByRole('button',{name:'Open conversation'}).click();expect((await posted).postDataJSON()).toEqual({participantId:agent.id});
 await expect(page.locator('.live-mobile-people')).toContainText('AGENT');await expect(page.locator('.live-mobile-people')).toContainText('unknown');
 await expect(page.getByRole('heading',{level:1})).toContainText('Alex');
});
