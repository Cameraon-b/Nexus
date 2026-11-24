import {test,expect,Page} from '@playwright/test';
const me={id:'account-a',email:'a@example.test',displayName:'Alice',participantId:'a',isAdmin:true};
const people=[{id:'a',name:'Alice',kind:'human',state:'active'},{id:'b',name:'Bob with a readable name',kind:'human',state:'active'},{id:'inactive',name:'Inactive',kind:'human',state:'inactive'},{id:'agent',name:'Agent',kind:'agent',state:'active'}];
const main={id:'main',title:'The Common Room',kind:'main',state:'active',participantIds:['a','b']};
const topic={id:'topic',title:'Public topic',kind:'topical',state:'active',participantIds:['a','b']};
const direct={id:'direct/one',title:people[1].name,kind:'direct',state:'active',participantIds:['a','b']};
async function fixture(page:Page,options:{include?:boolean;poll?:boolean;post?:(route:any)=>Promise<void>}={}){
 let reads=0;
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/status'))return route.fulfill({json:{requiresBootstrap:false,registrationAvailable:false}});
  if(path.endsWith('/me'))return route.fulfill({json:me});
  if(path.endsWith('/csrf'))return route.fulfill({json:{token:'fixture'}});
  if(path.endsWith('/home'))return route.fulfill({json:{participants:people,conversation:main,conversations:[main,topic,...(options.include||(options.poll&&++reads>1)?[direct]:[])],messages:[]}});
  if(route.request().method()==='POST'&&options.post)return options.post(route);
  if(path.endsWith('/messages'))return route.fulfill({json:[]});
  return route.fulfill({status:404});
 });
 await page.goto('/');
}
test('new message dialog validates, traps focus, guards pending closure, retries by pair and focuses composer',async({page})=>{
 let posts=0;let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 await fixture(page,{post:async route=>{
  expect(new URL(route.request().url()).pathname).toBe('/api/conversations/direct');expect(route.request().postDataJSON()).toEqual({participantId:'b'});posts++;
  if(posts===1)return route.fulfill({status:503,json:{title:'Try again'}});
  await gate;return route.fulfill({json:direct});
 }});
 await page.getByRole('button',{name:'Direct messages',exact:true}).click();
 const trigger=page.getByRole('button',{name:'New message',exact:true});await trigger.click();
 const dialog=page.getByRole('dialog',{name:'New message',exact:true});const select=page.getByLabel('Recipient');const close=page.getByRole('button',{name:'Close new message'});const submit=page.getByRole('button',{name:'Open conversation'});
 await expect(dialog).toHaveAttribute('aria-modal','true');await expect(select).toBeFocused();await expect(page.locator('.workspace-surface')).toHaveAttribute('inert','');
 await expect(select.locator('option')).toHaveText(['Choose a person',people[1].name,'Agent · AGENT · unknown']);
 await close.focus();await close.press('Shift+Tab');await expect(submit).toBeFocused();await submit.press('Tab');await expect(close).toBeFocused();
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
 await trigger.click();await page.locator('.direct-dialog-backdrop').click({position:{x:2,y:2}});await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
 await trigger.click();await submit.click();await expect(select).toHaveAttribute('aria-invalid','true');await expect(select).toHaveAttribute('aria-describedby','direct-error');await expect(dialog.getByRole('alert')).toContainText('Choose');expect(posts).toBe(0);
 await select.selectOption('b');await submit.click();await expect(dialog.getByRole('alert')).toContainText('server is unavailable');await expect(select).toHaveAttribute('aria-describedby','direct-error');
 await page.getByRole('button',{name:'Retry open conversation'}).click();await expect(page.getByRole('button',{name:'Opening…'})).toBeDisabled();
 await page.keyboard.press('Escape');await page.locator('.direct-dialog-backdrop').click({position:{x:2,y:2}});await expect(dialog).toBeVisible();await expect(close).toBeDisabled();expect(posts).toBe(2);await page.keyboard.press('Tab');expect(await dialog.evaluate(node=>node.contains(document.activeElement))).toBe(true);
 release();await expect(dialog).toHaveCount(0);await expect(page.getByLabel(`Message ${direct.title}`)).toBeFocused();await expect(page.locator('.workspace-surface')).not.toHaveAttribute('inert');await expect(page.getByRole('button',{name:direct.title,exact:true})).toHaveCount(1);
 await trigger.click();await select.selectOption('b');await page.getByRole('button',{name:'Open conversation'}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:direct.title,exact:true})).toHaveCount(1);await expect(page.getByLabel(`Message ${direct.title}`)).toBeFocused();
});
test('home polling discovers a DM without stealing selection or drafts',async({page})=>{
 await fixture(page,{poll:true});await page.getByRole('button',{name:'Topics',exact:true}).click();await page.getByRole('button',{name:topic.title,exact:true}).click();
 const composer=page.getByLabel(`Message ${topic.title}`);await composer.fill('Keep selected topic draft');await page.getByRole('button',{name:'Direct messages',exact:true}).click();
 await expect(page.getByRole('button',{name:direct.title,exact:true})).toBeVisible({timeout:8000});await expect(composer).toHaveValue('Keep selected topic draft');await expect(page.getByRole('heading',{name:topic.title,exact:true,level:1})).toBeVisible();
});
test('Main Topic and DM histories, retries, send locks and edited drafts stay independent',async({page})=>{
 const calls:Record<string,{body:string;clientRequestId:string}[]>={};const release:Record<string,()=>void>={};
 await fixture(page,{include:true,post:async route=>{
  const id=decodeURIComponent(new URL(route.request().url()).pathname.match(/conversations\/(.+)\/messages/)![1]);const payload=route.request().postDataJSON();(calls[id]??=[]).push(payload);
  if(id===direct.id&&calls[id].length===1)return route.abort('failed');
  await new Promise<void>(resolve=>{release[id]=resolve;});await route.fulfill({json:{id:`sent-${id}`,conversationId:id,authorId:'a',body:payload.body,state:'delivered',createdAt:new Date().toISOString()}});
 }});
 const select=async(kind:string)=>{if(kind==='main')return page.getByRole('button',{name:'Common room',exact:true}).click();await page.getByRole('button',{name:kind==='topic'?'Topics':'Direct messages',exact:true}).click();await page.getByRole('button',{name:kind==='topic'?topic.title:direct.title,exact:true}).click();};
 const composer=()=>page.locator('#live-message');
 await composer().fill('Main draft');await select('topic');await composer().fill('Topic draft');await select('direct');await composer().fill('DM draft');
 await select('main');await expect(composer()).toHaveValue('Main draft');await composer().press('Enter');await expect.poll(()=>calls.main?.length).toBe(1);
 await select('topic');await expect(composer()).toHaveValue('Topic draft');await composer().press('Enter');await expect.poll(()=>calls.topic?.length).toBe(1);
 await select('direct');await expect(composer()).toHaveValue('DM draft');await composer().press('Enter');await expect(page.getByRole('alert')).toContainText('not confirmed');await page.getByRole('button',{name:'Retry send'}).click();await expect.poll(()=>calls[direct.id]?.length).toBe(2);expect(calls[direct.id][0].clientRequestId).toBe(calls[direct.id][1].clientRequestId);
 await expect(composer()).toBeDisabled();release.main();await expect(composer()).toBeDisabled();
 await composer().evaluate(node=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(node,'Edited DM draft');node.dispatchEvent(new Event('input',{bubbles:true}));});
 release.topic();release[direct.id]();await expect(composer()).toBeEnabled();await expect(composer()).toHaveValue('Edited DM draft');await expect(page.getByRole('log').getByText('DM draft',{exact:true})).toBeVisible();
 await select('main');await expect(composer()).toHaveValue('');await expect(page.getByRole('log').getByText('Main draft',{exact:true})).toBeVisible();await select('topic');await expect(composer()).toHaveValue('');await expect(page.getByRole('log').getByText('Topic draft',{exact:true})).toBeVisible();
});
test('direct disclosure exposes selected state and readable mobile controls',async({page})=>{
 await page.setViewportSize({width:375,height:812});await fixture(page,{include:true});
 const toggle=page.getByRole('button',{name:'Direct messages',exact:true});
 await expect(toggle).toBeEnabled();await expect(toggle).toHaveAttribute('aria-expanded','false');await expect(toggle).not.toHaveAttribute('aria-controls');
 await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','true');await expect(toggle).toHaveAttribute('aria-controls','direct-list');
 const dm=page.getByRole('button',{name:direct.title,exact:true});
 for(const target of [toggle,dm,page.getByRole('button',{name:'New message',exact:true})]){const box=await target.boundingBox();expect(box?.width).toBeGreaterThanOrEqual(44);expect(box?.height).toBeGreaterThanOrEqual(44);}
 expect((await dm.getByText(direct.title).boundingBox())?.width).toBeGreaterThan(80);
 await dm.click();await expect(dm).toHaveAttribute('aria-current','page');await expect(page.getByLabel(`Message ${direct.title}`)).toBeVisible();await expect(page.getByRole('log',{name:`${direct.title} messages`})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
