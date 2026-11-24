import { test, expect } from '@playwright/test';
test('connection failure offers retry without inventing a setup state', async ({page}) => {
 let failed = true;
 await page.route('**/api/**', route => failed ? route.fulfill({status:503,body:'offline'}) : route.fulfill({json:{requiresBootstrap:true,registrationAvailable:false}}));
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Workspace unavailable'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Create workspace'})).toHaveCount(0);
 failed=false;
 await page.getByRole('button',{name:'Retry connection'}).click();
 await expect(page.getByRole('heading',{name:'Bring your workspace to life'})).toBeVisible();
});
test('messages persist through reload, retry with one request identity, and polling preserves drafts', async ({page}) => {
 const messages: {id:string;conversationId:string;authorId:string;body:string;state:string;createdAt:string}[]=[];
 const requests:string[]=[];let rejectFirst=true;let offline=false;let expired=false;
 await page.route('**/api/**', async route => {
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/status'))return route.fulfill({json:{requiresBootstrap:false,registrationAvailable:false}});
  if(path.endsWith('/csrf'))return route.fulfill({json:{token:'fixture-token'}});
  if(path.endsWith('/me'))return route.fulfill({status:expired?401:200,json:expired?{title:'Session ended'}:user});
  if(path.endsWith('/home')){
   if(expired)return route.fulfill({status:401,json:{title:'Session ended'}});
   if(offline)return route.fulfill({status:503,json:{title:'Unavailable'}});
   return route.fulfill({json:{participants:[person],conversation:{id:'main',title:'The Common Room',description:'Shared',participantIds:[person.id]},messages}});
  }
  if(path.endsWith('/messages')) {
   if(expired)return route.fulfill({status:401,json:{title:'Session ended'}});
   if(offline)return route.fulfill({status:503,json:{title:'Unavailable'}});
   if(route.request().method()==='POST') {
    const body=route.request().postDataJSON();requests.push(body.clientRequestId);
    if(rejectFirst){rejectFirst=false;return route.abort('failed');}
    const message={id:'message-1',conversationId:'main',authorId:person.id,body:body.body,state:'delivered',createdAt:new Date().toISOString()};messages.push(message);return route.fulfill({json:message});
   }
   return route.fulfill({json:messages});
  }
  return route.fulfill({status:404,json:{title:'Not implemented'}});
 });
 await page.goto('/');
 const composer=page.getByLabel('Message the Common Room');
 await composer.fill('A real persisted message');await composer.press('Enter');
 await expect(page.getByRole('alert')).toContainText('not confirmed');
 await expect(composer).toHaveValue('A real persisted message');
 await page.getByRole('button',{name:'Retry send'}).click();
 await expect(page.getByText('A real persisted message',{exact:true})).toBeVisible();
 expect(requests).toHaveLength(2);expect(requests[0]).toBe(requests[1]);
 await expect(composer).toHaveValue('');
 await page.reload();await expect(page.getByText('A real persisted message',{exact:true})).toBeVisible();
 await composer.fill('Unsent draft');offline=true;
 await expect(page.getByText('Local · disconnected',{exact:true})).toBeVisible({timeout:10000});
 await expect(composer).toHaveValue('Unsent draft');
 await expect(page.getByText('A real persisted message',{exact:true})).toBeVisible();
 offline=false;await expect(page.getByText('Local · connected',{exact:true})).toBeVisible({timeout:10000});
 expired=true;await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible({timeout:10000});
 await expect(composer).toHaveCount(0);
});
test('expired session during home load returns to login', async ({page}) => {
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/status'))return route.fulfill({json:{requiresBootstrap:false,registrationAvailable:false}});
  if(path.endsWith('/me'))return route.fulfill({json:user});
  return route.fulfill({status:401,json:{title:'Session expired'}});
 });
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
});
test('login reports field errors, clears them on edit, then renders safe message text on mobile', async ({page}) => {
 let signedIn=false;let first=true;let tokenCount=0;
 const body='<img src=x onerror=alert(1)> This is text, not HTML.';
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/status'))return route.fulfill({json:{requiresBootstrap:false,registrationAvailable:false}});
  if(path.endsWith('/csrf')){tokenCount++;return route.fulfill({json:{token:`token-${tokenCount}`}});}
  if(path.endsWith('/me'))return route.fulfill({status:signedIn?200:401,json:signedIn?user:{title:'Sign in required'}});
  if(path.endsWith('/login')){
   if(first){first=false;return route.fulfill({status:400,json:{title:'Check your details',errors:{Email:['Email was not recognized.']}}});}
   signedIn=true;return route.fulfill({json:user});
  }
  if(path.endsWith('/home'))return route.fulfill({json:{participants:[person],conversation:{id:'main',title:'The Common Room',description:'Shared',participantIds:[person.id]},messages:Array.from({length:30},(_,i)=>({id:`msg-${i}`,conversationId:'main',authorId:person.id,body:i===29?body:`Earlier message ${i}`,state:'delivered',createdAt:new Date().toISOString()}))}});
  return route.fulfill({json:[]});
 });
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await page.getByLabel('Email').fill('wrong@example.test');await page.getByLabel('Password',{exact:true}).fill('fixture-only-password');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByText('Email was not recognized.')).toBeVisible();
 await page.getByLabel('Email').fill(user.email);
 await expect(page.getByText('Email was not recognized.')).toHaveCount(0);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('heading',{name:'The Common Room'})).toBeVisible();
 expect(tokenCount).toBe(2);
 await expect(page.getByText(body,{exact:true})).toBeInViewport();
 await expect(page.locator('.message-content img')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Send',exact:true})).toBeInViewport();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/live-mobile.png'});
 await page.setViewportSize({width:1440,height:960});await page.screenshot({path:'test-results/live-desktop.png'});
});
test('email accepts the backend limit of 254 characters', async ({page}) => {
 await page.route('**/api/**',route=>route.fulfill({json:{requiresBootstrap:true,registrationAvailable:false}}));
 await page.goto('/');
 await expect(page.getByLabel('Email')).toHaveAttribute('maxlength','254');
 const email=`${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`;
 expect(email).toHaveLength(254);
 await page.getByLabel('Email').fill(email);
 await expect(page.getByLabel('Email')).toHaveValue(email);
});
test('a stale bootstrap conflict rediscovers existing-workspace authentication without retrying bootstrap', async ({page}) => {
 let requiresBootstrap=true;let bootstrapPosts=0;let statusReads=0;
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/status')){statusReads++;return route.fulfill({json:{requiresBootstrap,registrationAvailable:!requiresBootstrap}});}
  if(path.endsWith('/csrf'))return route.fulfill({json:{token:'stale-bootstrap-token'}});
  if(path.endsWith('/bootstrap')){
   bootstrapPosts++;requiresBootstrap=false;
   return route.fulfill({status:409,json:{title:'Workspace already initialized'}});
  }
  if(path.endsWith('/me'))return route.fulfill({status:401,json:{title:'Sign in required'}});
  return route.fulfill({status:404,json:{title:'Not implemented'}});
 });
 await page.goto('/');
 await page.getByLabel('Display name').fill('Second Browser');
 await page.getByLabel('Email').fill('second@example.test');
 await page.getByLabel('Password',{exact:true}).fill('fixture-only-password');
 await page.getByRole('button',{name:'Create workspace'}).click();
 await expect(page.getByRole('tab',{name:'Sign in'})).toBeVisible();
 await expect(page.getByRole('tab',{name:'Create account'})).toBeVisible();
 await expect(page.getByLabel('Email')).toHaveValue('second@example.test');
 await page.getByRole('tab',{name:'Create account'}).click();
 await expect(page.getByLabel('Display name')).toHaveValue('Second Browser');
 expect(bootstrapPosts).toBe(1);
 expect(statusReads).toBeGreaterThan(1);
});
test('a duplicate registration conflict remains a visible error', async ({page}) => {
 let statusReads=0;let registerPosts=0;
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/status')){statusReads++;return route.fulfill({json:{requiresBootstrap:false,registrationAvailable:true}});}
  if(path.endsWith('/me'))return route.fulfill({status:401,json:{title:'Sign in required'}});
  if(path.endsWith('/csrf'))return route.fulfill({json:{token:'registration-token'}});
  if(path.endsWith('/register')){registerPosts++;return route.fulfill({status:409,json:{title:'Email already registered'}});}
  return route.fulfill({status:404,json:{title:'Not implemented'}});
 });
 await page.goto('/');
 await page.getByRole('tab',{name:'Create account'}).click();
 await page.getByLabel('Display name').fill('Duplicate Human');
 await page.getByLabel('Email').fill('duplicate@example.test');
 await page.getByLabel('Password',{exact:true}).fill('fixture-only-password');
 const statusReadsBeforeSubmit=statusReads;
 await page.getByRole('button',{name:'Create account',exact:true}).click();
 await expect(page.getByRole('alert')).toHaveText('Email already registered');
 expect(registerPosts).toBe(1);
 expect(statusReads).toBe(statusReadsBeforeSubmit);
});
test('a returning visitor can switch to registration and enter the Common Room', async ({page}) => {
 let signedIn=false;let authPosts=0;let tokenCount=0;
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/status'))return route.fulfill({json:{requiresBootstrap:false,registrationAvailable:true}});
  if(path.endsWith('/me'))return route.fulfill({status:signedIn?200:401,json:signedIn?registeredUser:{title:'Sign in required'}});
  if(path.endsWith('/csrf'))return route.fulfill({json:{token:`register-token-${++tokenCount}`}});
  if(path.endsWith('/register')){
   authPosts++;
   expect(route.request().method()).toBe('POST');
   expect(route.request().headers()['x-csrf-token']).toBe('register-token-1');
   expect(route.request().postDataJSON()).toEqual({displayName:registeredUser.displayName,email:registeredUser.email,password:'twelve-chars!'});
   signedIn=true;return route.fulfill({json:registeredUser});
  }
  if(path.endsWith('/home'))return route.fulfill({json:{participants:[registeredPerson],conversation:{id:'main',title:'The Common Room',description:'Shared',participantIds:[registeredPerson.id]},messages:[]}});
  return route.fulfill({status:404,json:{title:'Not implemented'}});
 });
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
 await page.getByRole('tab',{name:'Create account'}).click();
 await expect(page.getByRole('heading',{name:'Create your account'})).toBeVisible();
 await expect(page.getByLabel('Display name')).toHaveAttribute('maxlength','100');
 await expect(page.getByLabel('Email')).toHaveAttribute('maxlength','254');
 await expect(page.getByLabel('Password',{exact:true})).toHaveAttribute('minlength','12');
 await expect(page.getByLabel('Password',{exact:true})).toHaveAttribute('maxlength','128');
 await page.getByLabel('Display name').fill(registeredUser.displayName);
 await page.getByLabel('Email').fill(registeredUser.email);
 await page.getByLabel('Password',{exact:true}).fill('twelve-chars!');
 await page.getByRole('button',{name:'Create account',exact:true}).click();
 await expect(page.getByRole('heading',{name:'The Common Room'})).toBeVisible();
 expect(authPosts).toBe(1);expect(tokenCount).toBe(2);
});
test('home polling reveals a newcomer without replacing an unsent draft', async ({page}) => {
 let homeReads=0;
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/status'))return route.fulfill({json:{requiresBootstrap:false,registrationAvailable:false}});
  if(path.endsWith('/me'))return route.fulfill({json:user});
  if(path.endsWith('/home')){
   homeReads++;
   const participants=homeReads>1?[person,registeredPerson]:[person];
   return route.fulfill({json:{participants,conversation:{id:'main',title:'The Common Room',description:'Shared',participantIds:participants.map(item=>item.id)},messages:[]}});
  }
  return route.fulfill({status:404,json:{title:'Not implemented'}});
 });
 await page.goto('/');
 const composer=page.getByLabel('Message the Common Room');
 await composer.fill('Keep this draft while people arrive');
 await expect(page.getByText(registeredPerson.name,{exact:true})).toBeVisible({timeout:7000});
 await expect(composer).toHaveValue('Keep this draft while people arrive');
 expect(homeReads).toBeGreaterThan(1);
});
test('a delayed stale home poll cannot erase a locally delivered message', async ({page}) => {
 let homeReads=0;let completedDelayedPolls=0;let releasePoll!:()=>void;let markPollStarted!:()=>void;
 const delayedPoll=new Promise<void>(resolve=>{releasePoll=resolve;});
 const pollStarted=new Promise<void>(resolve=>{markPollStarted=resolve;});
 const emptyRoom={participants:[person],conversation:{id:'main',title:'The Common Room',description:'Shared',participantIds:[person.id]},messages:[]};
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/status'))return route.fulfill({json:{requiresBootstrap:false,registrationAvailable:false}});
  if(path.endsWith('/me'))return route.fulfill({json:user});
  if(path.endsWith('/csrf'))return route.fulfill({json:{token:'message-token'}});
  if(path.endsWith('/home')){
   homeReads++;
   if(homeReads>1){markPollStarted();await delayedPoll;await route.fulfill({json:emptyRoom});completedDelayedPolls++;return;}
   return route.fulfill({json:emptyRoom});
  }
  if(path.endsWith('/messages')&&route.request().method()==='POST'){
   const body=route.request().postDataJSON();
   return route.fulfill({json:{id:'locally-delivered',conversationId:'main',authorId:person.id,body:body.body,state:'delivered',createdAt:new Date().toISOString()}});
  }
  return route.fulfill({status:404,json:{title:'Not implemented'}});
 });
 await page.goto('/');
 await pollStarted;
 const composer=page.getByLabel('Message the Common Room');
 await composer.fill('Do not erase this message');
 await composer.press('Enter');
 await expect(page.getByText('Do not erase this message',{exact:true})).toBeVisible();
 releasePoll();
 await expect.poll(()=>completedDelayedPolls).toBe(1);
 await expect(page.getByText('Do not erase this message',{exact:true})).toBeVisible();
});
test('composer caps input at the backend limit of 5000 characters', async ({page}) => {
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/status'))return route.fulfill({json:{requiresBootstrap:false,registrationAvailable:false}});
  if(path.endsWith('/me'))return route.fulfill({json:user});
  return route.fulfill({json:{participants:[person],conversation:{id:'main',title:'The Common Room',description:'Shared',participantIds:[person.id]},messages:[]}});
 });
 await page.goto('/');
 const composer=page.getByLabel('Message the Common Room');
 await expect(composer).toHaveAttribute('maxlength','5000');
 await composer.fill('a'.repeat(5001));
 await expect(composer).toHaveValue('a'.repeat(5000));
});
test('topics disclosure and selected conversation expose accessible state', async ({page}) => {
 const main={id:'main',title:'The Common Room',kind:'main',state:'active',participantIds:[person.id],description:'Shared',createdAt:'2026-01-01T00:00:00Z'};
 const topic={id:'topic/accessible',title:'Accessible topic',kind:'topical',state:'active',participantIds:[person.id],description:'Clear state',createdAt:'2026-01-02T00:00:00Z'};
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/status'))return route.fulfill({json:{requiresBootstrap:false,registrationAvailable:false}});
  if(path.endsWith('/me'))return route.fulfill({json:user});
  if(path.endsWith('/workspace/home'))return route.fulfill({json:{participants:[person],conversation:main,conversations:[main,topic],messages:[]}});
  if(path.endsWith('/conversations/topic%2Faccessible/messages'))return route.fulfill({json:[]});
  return route.fulfill({status:404,json:{title:'Not implemented'}});
 });
 await page.goto('/');
 const toggle=page.getByRole('button',{name:'Topics'});
 await expect(toggle).toHaveAttribute('aria-expanded','false');
 await expect(toggle).not.toHaveAttribute('aria-controls','topic-list');
 await toggle.click();
 await expect(toggle).toHaveAttribute('aria-expanded','true');
 await expect(toggle).toHaveAttribute('aria-controls','topic-list');
 await expect(page.locator('#topic-list')).toBeVisible();
 const topicButton=page.getByRole('button',{name:topic.title});
 await topicButton.click();
 await expect(topicButton).toHaveAttribute('aria-current','page');
 await expect(page.getByRole('button',{name:'Common room'})).not.toHaveAttribute('aria-current','page');
});
test('topics open as a usable narrow-screen panel without horizontal overflow', async ({page}) => {
 const main={id:'main',title:'The Common Room',kind:'main',state:'active',participantIds:[person.id],description:'Shared',createdAt:'2026-01-01T00:00:00Z'};
 const topic={id:'topic/mobile',title:'Readable mobile topic',kind:'topical',state:'active',participantIds:[person.id],description:'Fits narrow screens',createdAt:'2026-01-02T00:00:00Z'};
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/status'))return route.fulfill({json:{requiresBootstrap:false,registrationAvailable:false}});
  if(path.endsWith('/me'))return route.fulfill({json:user});
  if(path.endsWith('/workspace/home'))return route.fulfill({json:{participants:[person],conversation:main,conversations:[main,topic],messages:[]}});
  return route.fulfill({status:404,json:{title:'Not implemented'}});
 });
 await page.setViewportSize({width:375,height:812});await page.goto('/');
 await page.getByRole('button',{name:'Topics'}).click();
 const panel=page.locator('#topic-list');const newTopic=page.getByRole('button',{name:'New topic'});const topicButton=page.getByRole('button',{name:topic.title});
 await expect(panel).toBeVisible();await expect(topicButton.getByText(topic.title,{exact:true})).toBeVisible();
 for(const target of [newTopic,topicButton]){
  const box=await target.boundingBox();expect(box?.width).toBeGreaterThanOrEqual(44);expect(box?.height).toBeGreaterThanOrEqual(44);
 }
 expect((await topicButton.getByText(topic.title,{exact:true}).boundingBox())?.width).toBeGreaterThan(80);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('topic creation reports whitespace-only required fields with associated accessible errors', async ({page}) => {
 const main={id:'main',title:'The Common Room',kind:'main',state:'active',participantIds:[person.id],description:'Shared',createdAt:'2026-01-01T00:00:00Z'};
 let creationPosts=0;
 await page.route('**/api/**',route=>{
  const request=route.request();const path=new URL(request.url()).pathname;
  if(path.endsWith('/status'))return route.fulfill({json:{requiresBootstrap:false,registrationAvailable:false}});
  if(path.endsWith('/me'))return route.fulfill({json:user});
  if(path.endsWith('/workspace/home'))return route.fulfill({json:{participants:[person],conversation:main,conversations:[main],messages:[]}});
  if(path.endsWith('/conversations/topical')&&request.method()==='POST'){creationPosts++;return route.fulfill({status:500,json:{title:'Should not submit'}});}
  return route.fulfill({status:404,json:{title:'Not implemented'}});
 });
 await page.goto('/');await page.getByRole('button',{name:'Topics'}).click();await page.getByRole('button',{name:'New topic'}).click();
 const title=page.getByLabel('Topic title');const opening=page.getByLabel('Opening message');
 await title.fill('   ');await opening.fill('\n\t ');await page.getByRole('button',{name:'Create topic'}).click();
 await expect(page.getByText('Enter a topic title.')).toBeVisible();await expect(page.getByText('Enter an opening message.')).toBeVisible();
 await expect(title).toHaveAttribute('aria-invalid','true');await expect(opening).toHaveAttribute('aria-invalid','true');
 await expect(title).toHaveAttribute('aria-describedby','topic-title-error');await expect(opening).toHaveAttribute('aria-describedby','topic-opening-error');
 expect(creationPosts).toBe(0);
 await title.fill('A valid title');
 await expect(title).not.toHaveAttribute('aria-invalid','true');await expect(page.getByText('Enter a topic title.')).toHaveCount(0);
 await expect(opening).toHaveAttribute('aria-invalid','true');
});
test('new topic dialog is labelled, modal, focus trapped, inerting the background, and restores its trigger', async ({page}) => {
 const main={id:'main',title:'The Common Room',kind:'main',state:'active',participantIds:[person.id],description:'Shared',createdAt:'2026-01-01T00:00:00Z'};
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/status'))return route.fulfill({json:{requiresBootstrap:false,registrationAvailable:false}});
  if(path.endsWith('/me'))return route.fulfill({json:user});
  if(path.endsWith('/workspace/home'))return route.fulfill({json:{participants:[person],conversation:main,conversations:[main],messages:[]}});
  return route.fulfill({status:404,json:{title:'Not implemented'}});
 });
 await page.goto('/');await page.getByRole('button',{name:'Topics'}).click();
 const trigger=page.getByRole('button',{name:'New topic'});await trigger.focus();await trigger.click();
 const dialog=page.getByRole('dialog',{name:'New topic'});const title=page.getByLabel('Topic title');const close=page.getByRole('button',{name:'Close new topic'});const create=page.getByRole('button',{name:'Create topic'});
 await expect(dialog).toHaveAttribute('aria-modal','true');await expect(dialog).toHaveAttribute('aria-labelledby','new-topic-title');
 await expect(title).toBeFocused();await expect(page.locator('.workspace-surface')).toHaveAttribute('inert','');
 await close.focus();await close.press('Shift+Tab');await expect(create).toBeFocused();await create.press('Tab');await expect(close).toBeFocused();
 await title.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();await expect(page.locator('.workspace-surface')).not.toHaveAttribute('inert','');
});
test('new topic dialog ignores Escape while creation is pending', async ({page}) => {
 const main={id:'main',title:'The Common Room',kind:'main',state:'active',participantIds:[person.id],description:'Shared',createdAt:'2026-01-01T00:00:00Z'};
 let postStarted!:()=>void;const started=new Promise<void>(resolve=>{postStarted=resolve;});
 await page.route('**/api/**',async route=>{const request=route.request();const path=new URL(request.url()).pathname;
  if(path.endsWith('/status'))return route.fulfill({json:{requiresBootstrap:false,registrationAvailable:false}});
  if(path.endsWith('/me'))return route.fulfill({json:user});
  if(path.endsWith('/csrf'))return route.fulfill({json:{token:'pending-topic-token'}});
  if(path.endsWith('/workspace/home'))return route.fulfill({json:{participants:[person],conversation:main,conversations:[main],messages:[]}});
  if(path.endsWith('/conversations/topical')&&request.method()==='POST'){postStarted();await new Promise(()=>{});return;}
  return route.fulfill({status:404,json:{title:'Not implemented'}});
 });
 await page.goto('/');await page.getByRole('button',{name:'Topics'}).click();await page.getByRole('button',{name:'New topic'}).click();
 await page.getByLabel('Topic title').fill('Pending topic');await page.getByLabel('Opening message').fill('Still creating');
 await page.getByRole('button',{name:'Create topic'}).click();await started;await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog',{name:'New topic'})).toBeVisible();await expect(page.getByRole('button',{name:'Creating…'})).toBeDisabled();
});
test('topics validate, retry one creation identity, select the opening message, and keep drafts per conversation', async ({page}) => {
 const main={id:'main',title:'The Common Room',kind:'main',state:'active',participantIds:[person.id],description:'Shared',createdAt:'2026-01-01T00:00:00Z'};
 const existing={id:'topic/existing',title:'Existing topic',kind:'topical',state:'active',participantIds:[person.id],description:'A public topic',createdAt:'2026-01-02T00:00:00Z'};
 const created={id:'topic/new one',title:'Safe <b>topic</b>',kind:'topical',state:'active',participantIds:[person.id],description:'Literal <img src=x onerror=alert(1)>',createdAt:'2026-01-03T00:00:00Z'};
 const histories:Record<string,unknown[]>={main:[],[existing.id]:[],[created.id]:[]};
 const creationIds:string[]=[];const messageDestinations:string[]=[];let failCreate=true;
 await page.route('**/api/**',async route=>{
  const request=route.request();const path=new URL(request.url()).pathname;
  if(path.endsWith('/status'))return route.fulfill({json:{requiresBootstrap:false,registrationAvailable:false}});
  if(path.endsWith('/me'))return route.fulfill({json:user});
  if(path.endsWith('/csrf'))return route.fulfill({json:{token:'topic-token'}});
  if(path.endsWith('/workspace/home'))return route.fulfill({json:{participants:[person],conversation:main,conversations:[main,existing,...(creationIds.length>1?[created]:[])],messages:histories.main}});
  if(path.endsWith('/conversations/topical')&&request.method()==='POST'){
   const body=request.postDataJSON();creationIds.push(body.clientRequestId);
   expect(body).toMatchObject({title:created.title,description:created.description,openingMessage:'Opening <script>alert(1)</script>'});
   if(failCreate){failCreate=false;return route.fulfill({status:503,json:{title:'Unavailable'}});}
   const opening={id:'opening',conversationId:created.id,authorId:person.id,body:body.openingMessage,state:'delivered',createdAt:'2026-01-03T00:00:01Z'};
   histories[created.id]=[opening];return route.fulfill({json:{conversation:created,openingMessage:opening}});
  }
  const match=path.match(/\/conversations\/(.+)\/messages$/);
  if(match){const id=decodeURIComponent(match[1]);
   if(request.method()==='GET')return route.fulfill({json:histories[id]??[]});
   const body=request.postDataJSON();messageDestinations.push(id);
   const message={id:`sent-${messageDestinations.length}`,conversationId:id,authorId:person.id,body:body.body,state:'delivered',createdAt:new Date().toISOString()};
   histories[id]=[...(histories[id]??[]),message];return route.fulfill({json:message});
  }
  return route.fulfill({status:404,json:{title:'Not implemented'}});
 });
 await page.goto('/');
 await page.getByRole('button',{name:'Topics'}).click();
 await expect(page.getByRole('button',{name:'Existing topic'})).toBeVisible();
 await page.getByRole('button',{name:'New topic'}).click();
 const title=page.getByLabel('Topic title');const description=page.getByLabel('Description');const opening=page.getByLabel('Opening message');
 await expect(title).toHaveAttribute('required','');await expect(title).toHaveAttribute('maxlength','80');
 await expect(description).toHaveAttribute('maxlength','160');await expect(opening).toHaveAttribute('required','');await expect(opening).toHaveAttribute('maxlength','5000');
 await page.getByRole('button',{name:'Create topic'}).click();
 expect(creationIds).toHaveLength(0);
 await title.fill(created.title);await description.fill(created.description);await opening.fill('Opening <script>alert(1)</script>');
 await page.getByRole('button',{name:'Create topic'}).click();
 await expect(page.getByRole('alert')).toContainText('retry');
 await expect(title).toHaveValue(created.title);await expect(description).toHaveValue(created.description);await expect(opening).toHaveValue('Opening <script>alert(1)</script>');
 await page.getByRole('button',{name:'Retry create topic'}).click();
 expect(creationIds).toHaveLength(2);expect(creationIds[0]).toBe(creationIds[1]);
 await expect(page.getByRole('heading',{name:created.title})).toBeVisible();
 await expect(page.getByText('Opening <script>alert(1)</script>',{exact:true})).toBeVisible();
 await expect(page.locator('.conversation-heading b,.conversation-heading img,.message-content script')).toHaveCount(0);
 const topicComposer=page.getByLabel(`Message ${created.title}`);
 await expect(topicComposer).toBeFocused();
 expect(await page.evaluate(()=>document.activeElement?.tagName)).not.toBe('BODY');
 await topicComposer.fill('Topic draft');
 await page.getByRole('button',{name:'Common room'}).click();
 const mainComposer=page.getByLabel('Message the Common Room');await mainComposer.fill('Main draft');
 await page.getByRole('button',{name:created.title}).click();await expect(topicComposer).toHaveValue('Topic draft');
 await topicComposer.fill('Sent to topic');await topicComposer.press('Enter');await expect(page.getByText('Sent to topic',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Common room'}).click();await expect(mainComposer).toHaveValue('Main draft');
 await mainComposer.press('Enter');await expect(page.getByText('Main draft',{exact:true})).toBeVisible();
 expect(messageDestinations).toEqual([created.id,'main']);
});
test('message retry identities and failures remain isolated by destination', async ({page}) => {
 const main={id:'main',title:'The Common Room',kind:'main',state:'active',participantIds:[person.id],description:'Shared',createdAt:'2026-01-01T00:00:00Z'};
 const topic={id:'topic/retries',title:'Retry topic',kind:'topical',state:'active',participantIds:[person.id],description:'Retry separately',createdAt:'2026-01-02T00:00:00Z'};
 const ids:Record<string,string[]>={main:[],[topic.id]:[]};
 await page.route('**/api/**',async route=>{
  const request=route.request();const path=new URL(request.url()).pathname;
  if(path.endsWith('/status'))return route.fulfill({json:{requiresBootstrap:false,registrationAvailable:false}});
  if(path.endsWith('/me'))return route.fulfill({json:user});
  if(path.endsWith('/csrf'))return route.fulfill({json:{token:'retry-token'}});
  if(path.endsWith('/workspace/home'))return route.fulfill({json:{participants:[person],conversation:main,conversations:[main,topic],messages:[]}});
  const match=path.match(/\/conversations\/(.+)\/messages$/);
  if(match){const destination=decodeURIComponent(match[1]);if(request.method()==='GET')return route.fulfill({json:[]});
   const body=request.postDataJSON();ids[destination].push(body.clientRequestId);
   if(ids[destination].length===1)return route.abort('failed');
   return route.fulfill({json:{id:`${destination}-sent`,conversationId:destination,authorId:person.id,body:body.body,state:'delivered',createdAt:new Date().toISOString()}});
  }
  return route.fulfill({status:404,json:{title:'Not implemented'}});
 });
 await page.goto('/');await page.getByRole('button',{name:'Topics'}).click();await page.getByRole('button',{name:topic.title}).click();
 const topicComposer=page.getByLabel(`Message ${topic.title}`);await topicComposer.fill('Retry topic body');await topicComposer.press('Enter');
 await expect(page.getByRole('alert')).toContainText('not confirmed');
 await page.getByRole('button',{name:'Common room'}).click();const mainComposer=page.getByLabel('Message the Common Room');await mainComposer.fill('Retry main body');await mainComposer.press('Enter');
 await expect(page.getByRole('alert')).toContainText('not confirmed');
 await page.getByRole('button',{name:topic.title}).click();
 await expect(page.getByRole('alert')).toContainText('not confirmed');await page.getByRole('button',{name:'Retry send'}).click();
 await page.getByRole('button',{name:'Common room'}).click();await expect(page.getByRole('alert')).toContainText('not confirmed');await page.getByRole('button',{name:'Retry send'}).click();
 expect(ids[topic.id]).toHaveLength(2);expect(ids[topic.id][0]).toBe(ids[topic.id][1]);
 expect(ids.main).toHaveLength(2);expect(ids.main[0]).toBe(ids.main[1]);expect(ids.main[0]).not.toBe(ids[topic.id][0]);
});
test('overlapping sends keep each conversation pending and preserve an edited draft', async ({page}) => {
 const main={id:'main',title:'The Common Room',kind:'main',state:'active',participantIds:[person.id],description:'Shared',createdAt:'2026-01-01T00:00:00Z'};
 const topic={id:'topic/overlap',title:'Overlap topic',kind:'topical',state:'active',participantIds:[person.id],description:'Concurrent sends',createdAt:'2026-01-02T00:00:00Z'};
 let releaseMain!:()=>void;let releaseTopic!:()=>void;let mainStarted!:()=>void;let topicStarted!:()=>void;let mainFinished!:()=>void;
 const mainGate=new Promise<void>(resolve=>{releaseMain=resolve;});const topicGate=new Promise<void>(resolve=>{releaseTopic=resolve;});
 const mainRequest=new Promise<void>(resolve=>{mainStarted=resolve;});const topicRequest=new Promise<void>(resolve=>{topicStarted=resolve;});const mainResponse=new Promise<void>(resolve=>{mainFinished=resolve;});
 await page.route('**/api/**',async route=>{
  const request=route.request();const path=new URL(request.url()).pathname;
  if(path.endsWith('/status'))return route.fulfill({json:{requiresBootstrap:false,registrationAvailable:false}});
  if(path.endsWith('/me'))return route.fulfill({json:user});
  if(path.endsWith('/csrf'))return route.fulfill({json:{token:'overlap-token'}});
  if(path.endsWith('/workspace/home'))return route.fulfill({json:{participants:[person],conversation:main,conversations:[main,topic],messages:[]}});
  const match=path.match(/\/conversations\/(.+)\/messages$/);
  if(match){const destination=decodeURIComponent(match[1]);if(request.method()==='GET')return route.fulfill({json:[]});
   const body=request.postDataJSON();
   if(destination==='main'){mainStarted();await mainGate;}else{topicStarted();await topicGate;}
   await route.fulfill({json:{id:`${destination}-sent`,conversationId:destination,authorId:person.id,body:body.body,state:'delivered',createdAt:new Date().toISOString()}});
   if(destination==='main')mainFinished();return;
  }
  return route.fulfill({status:404,json:{title:'Not implemented'}});
 });
 await page.goto('/');
 const mainComposer=page.getByLabel('Message the Common Room');await mainComposer.fill('Main in flight');await mainComposer.press('Enter');await mainRequest;
 await page.getByRole('button',{name:'Topics'}).click();await page.getByRole('button',{name:topic.title}).click();
 const topicComposer=page.getByLabel(`Message ${topic.title}`);await topicComposer.fill('Topic in flight');await topicComposer.press('Enter');await topicRequest;
 releaseMain();await mainResponse;
 await expect(topicComposer).toBeDisabled();await expect(page.getByRole('button',{name:'Sending…'})).toBeDisabled();
 await topicComposer.evaluate(node=>{const input=node as HTMLTextAreaElement;const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set;setter?.call(input,'Edited after submit');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await expect(topicComposer).toHaveValue('Edited after submit');
 releaseTopic();await expect(page.getByText('Topic in flight',{exact:true})).toBeVisible();
 await expect(topicComposer).toHaveValue('Edited after submit');await expect(topicComposer).toBeEnabled();
});
test('a stale topic history response cannot erase a local send', async ({page}) => {
 const main={id:'main',title:'The Common Room',kind:'main',state:'active',participantIds:[person.id],description:'Shared',createdAt:'2026-01-01T00:00:00Z'};
 const topic={id:'topic/stale path',title:'Stale response topic',kind:'topical',state:'active',participantIds:[person.id],description:'History races',createdAt:'2026-01-02T00:00:00Z'};
 let releaseHistory!:()=>void;let markStarted!:()=>void;let completed=false;
 const historyGate=new Promise<void>(resolve=>{releaseHistory=resolve;});const historyStarted=new Promise<void>(resolve=>{markStarted=resolve;});
 await page.route('**/api/**',async route=>{
  const request=route.request();const path=new URL(request.url()).pathname;
  if(path.endsWith('/status'))return route.fulfill({json:{requiresBootstrap:false,registrationAvailable:false}});
  if(path.endsWith('/me'))return route.fulfill({json:user});
  if(path.endsWith('/csrf'))return route.fulfill({json:{token:'stale-token'}});
  if(path.endsWith('/workspace/home'))return route.fulfill({json:{participants:[person],conversation:main,conversations:[main,topic],messages:[]}});
  if(path===`/api/conversations/${encodeURIComponent(topic.id)}/messages`&&request.method()==='GET'){markStarted();await historyGate;await route.fulfill({json:[]});completed=true;return;}
  if(path===`/api/conversations/${encodeURIComponent(topic.id)}/messages`&&request.method()==='POST'){
   const body=request.postDataJSON();return route.fulfill({json:{id:'local-topic-message',conversationId:topic.id,authorId:person.id,body:body.body,state:'delivered',createdAt:new Date().toISOString()}});
  }
  return route.fulfill({status:404,json:{title:'Not implemented'}});
 });
 await page.goto('/');await page.getByRole('button',{name:'Topics'}).click();await page.getByRole('button',{name:topic.title}).click();await historyStarted;
 const composer=page.getByLabel(`Message ${topic.title}`);await composer.fill('Keep this topic message');await composer.press('Enter');
 await expect(page.getByText('Keep this topic message',{exact:true})).toBeVisible();releaseHistory();await expect.poll(()=>completed).toBe(true);
 await expect(page.getByText('Keep this topic message',{exact:true})).toBeVisible();
});
test('session expiry while loading a selected topic returns to sign in', async ({page}) => {
 const main={id:'main',title:'The Common Room',kind:'main',state:'active',participantIds:[person.id],description:'Shared'};
 let expired=false;
 const topic={id:'expired-topic',title:'Expiring topic',kind:'topical',state:'active',participantIds:[person.id],description:'Session check'};
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/status'))return route.fulfill({json:{requiresBootstrap:false,registrationAvailable:false}});
  if(path.endsWith('/me'))return route.fulfill({status:expired?401:200,json:user});
  if(path.endsWith('/workspace/home'))return route.fulfill({json:{participants:[person],conversation:main,conversations:[main,topic],messages:[]}});
  if(path.endsWith('/conversations/expired-topic/messages')){expired=true;return route.fulfill({status:401,json:{title:'Session expired'}});}
  return route.fulfill({status:404,json:{title:'Not implemented'}});
 });
 await page.goto('/');await page.getByRole('button',{name:'Topics'}).click();await page.getByRole('button',{name:topic.title}).click();
 await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();await expect(page.getByText('Your session ended. Sign in again.')).toBeVisible();
});
for (const mode of ['bootstrap','login','register'] as const) {
 test(`${mode} recovers from post-auth CSRF failure without repeating authentication`, async ({page}) => {
  let signedIn=false;let authPosts=0;let tokens=0;let sessionReads=0;
  await page.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname;
   if(path.endsWith('/status'))return route.fulfill({json:{requiresBootstrap:mode==='bootstrap'&&authPosts===0,registrationAvailable:mode!=='bootstrap'||authPosts>0}});
   if(path.endsWith('/csrf')) {
    tokens++;
    return tokens===2?route.fulfill({status:503,json:{title:'Temporary outage'}}):route.fulfill({json:{token:`token-${tokens}`}});
   }
   if(path.endsWith(`/${mode}`)){authPosts++;signedIn=true;return route.fulfill({json:user});}
   if(path.endsWith('/me')){if(signedIn)sessionReads++;return route.fulfill({status:signedIn?200:401,json:signedIn?user:{title:'Sign in required'}});}
   if(path.endsWith('/home'))return route.fulfill({json:{participants:[person],conversation:{id:'main',title:'The Common Room',description:'Shared',participantIds:[person.id]},messages:[]}});
   if(path.endsWith('/logout')){expect(route.request().headers()['x-csrf-token']).toBe('token-3');signedIn=false;return route.fulfill({status:204});}
   return route.fulfill({json:[]});
  });
  await page.goto('/');
  if(mode==='register')await page.getByRole('tab',{name:'Create account'}).click();
  if(mode!=='login')await page.getByLabel('Display name').fill(user.displayName);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password',{exact:true}).fill('fixture-only-password');
  await page.getByRole('button',{name:mode==='bootstrap'?'Create workspace':mode==='register'?'Create account':'Sign in',exact:true}).click();
  await expect(page.getByRole('heading',{name:'The Common Room'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Create workspace'})).toHaveCount(0);
  expect(sessionReads).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Sign out'}).click();
  await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
  expect(tokens).toBe(3);expect(authPosts).toBe(1);
 });
}
// Every API request is intercepted. These fixtures never initialize a real database.
const user = {id:'fixture-user',participantId:'fixture-person',displayName:'Test Member',email:'member@example.test',isAdmin:true};
const person = {id:user.participantId,name:user.displayName,kind:'human',state:'active',availability:'available',isAdmin:true};
const registeredUser = {id:'registered-user',participantId:'registered-person',displayName:'New Human',email:'new@example.test',isAdmin:false};
const registeredPerson = {id:registeredUser.participantId,name:registeredUser.displayName,kind:'human',state:'active',availability:'available',isAdmin:false};
test('first run creates an authenticated participant-first room and signs out', async ({page}) => {
 let signedIn = false; let bootstrap = true;
 await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (path.endsWith('/status')) return route.fulfill({json:{requiresBootstrap:bootstrap,registrationAvailable:false}});
  if (path.endsWith('/csrf')) return route.fulfill({json:{token:'fixture-csrf'}});
  if (path.endsWith('/bootstrap')) { expect(route.request().headers()['x-csrf-token']).toBe('fixture-csrf'); signedIn=true;bootstrap=false;return route.fulfill({json:user}); }
  if (path.endsWith('/me')) return route.fulfill({status:signedIn?200:401,json:signedIn?user:{title:'Sign in required'}});
  if (path.endsWith('/home')) return route.fulfill({json:{participants:[person],conversation:{id:'main',title:'The Common Room',kind:'main',state:'active',participantIds:[person.id],description:'A shared place to think.'},messages:[]}});
  if (path.endsWith('/logout')) {signedIn=false;return route.fulfill({status:204});}
  return route.fulfill({status:404,json:{title:'Not implemented'}});
 });
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Bring your workspace to life'})).toBeVisible();
 await page.getByLabel('Display name').fill(user.displayName);
 await page.getByLabel('Email').fill(user.email);
 await page.getByLabel('Password',{exact:true}).fill('fixture-only-password');
 await page.getByRole('button',{name:'Create workspace'}).click();
 await expect(page.getByRole('heading',{name:'The Common Room'})).toBeVisible();
 await expect(page.getByText('Local · connected',{exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Participants'})).toBeVisible();
 await expect(page.getByText('Start the conversation',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Direct messages',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Sign out'}).click();
 await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
});


test('production closed registration has no affordance even on a direct route', async ({page}) => {
 await page.route('**/api/**', route => new URL(route.request().url()).pathname.endsWith('/status') ? route.fulfill({json:{requiresBootstrap:false,registrationAvailable:false}}) : route.fulfill({status:401,json:{}}));
 await page.goto('/register');
 await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
 await expect(page.getByRole('tab',{name:'Create account'})).toHaveCount(0);
 await expect(page.getByRole('tablist')).toHaveCount(0);
 await expect(page.getByRole('tabpanel')).toHaveCount(0);
 await expect(page.getByLabel('Display name')).toHaveCount(0);
});

test('authentication tabs associate panels and support roving arrow focus',async({page})=>{
 await page.route('**/api/**',route=>new URL(route.request().url()).pathname.endsWith('/status')?route.fulfill({json:{requiresBootstrap:false,registrationAvailable:true}}):route.fulfill({status:401,json:{}}));
 await page.goto('/');
 const login=page.getByRole('tab',{name:'Sign in'}),register=page.getByRole('tab',{name:'Create account'});
 await expect(login).toHaveAttribute('tabindex','0');await expect(register).toHaveAttribute('tabindex','-1');
 await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby',await login.getAttribute('id')??'missing');
 await expect(page.getByRole('tabpanel')).toHaveAttribute('id',await login.getAttribute('aria-controls')??'missing');
 await page.getByLabel('Password',{exact:true}).fill('Never-retain-this-password');
 await login.focus();await page.keyboard.press('ArrowRight');
 await expect(register).toBeFocused();await expect(register).toHaveAttribute('aria-selected','true');await expect(register).toHaveAttribute('tabindex','0');await expect(login).toHaveAttribute('tabindex','-1');
 await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby',await register.getAttribute('id')??'missing');
 await expect(page.getByRole('tabpanel')).toHaveAttribute('id',await register.getAttribute('aria-controls')??'missing');
 await expect(page.getByLabel('Password',{exact:true})).toHaveValue('');
 await page.keyboard.press('ArrowRight');await expect(login).toBeFocused();
 await page.keyboard.press('ArrowLeft');await expect(register).toBeFocused();
 await login.click();await expect(login).toHaveAttribute('aria-selected','true');
});
