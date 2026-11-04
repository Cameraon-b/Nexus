import { test, expect } from '@playwright/test';
test('connection failure offers retry without inventing a setup state', async ({page}) => {
 let failed = true;
 await page.route('**/api/**', route => failed ? route.fulfill({status:503,body:'offline'}) : route.fulfill({json:{requiresBootstrap:true}}));
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
  if(path.endsWith('/status'))return route.fulfill({json:{requiresBootstrap:false}});
  if(path.endsWith('/csrf'))return route.fulfill({json:{token:'fixture-token'}});
  if(path.endsWith('/me'))return route.fulfill({status:expired?401:200,json:expired?{title:'Session ended'}:user});
  if(path.endsWith('/home'))return route.fulfill({json:{participants:[person],conversation:{id:'main',title:'The Common Room',description:'Shared',participantIds:[person.id]},messages}});
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
  if(path.endsWith('/status'))return route.fulfill({json:{requiresBootstrap:false}});
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
  if(path.endsWith('/status'))return route.fulfill({json:{requiresBootstrap:false}});
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
 await page.route('**/api/**',route=>route.fulfill({json:{requiresBootstrap:true}}));
 await page.goto('/');
 await expect(page.getByLabel('Email')).toHaveAttribute('maxlength','254');
 const email=`${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`;
 expect(email).toHaveLength(254);
 await page.getByLabel('Email').fill(email);
 await expect(page.getByLabel('Email')).toHaveValue(email);
});
test('composer caps input at the backend limit of 5000 characters', async ({page}) => {
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/status'))return route.fulfill({json:{requiresBootstrap:false}});
  if(path.endsWith('/me'))return route.fulfill({json:user});
  return route.fulfill({json:{participants:[person],conversation:{id:'main',title:'The Common Room',description:'Shared',participantIds:[person.id]},messages:[]}});
 });
 await page.goto('/');
 const composer=page.getByLabel('Message the Common Room');
 await expect(composer).toHaveAttribute('maxlength','5000');
 await composer.fill('a'.repeat(5001));
 await expect(composer).toHaveValue('a'.repeat(5000));
});
for (const mode of ['bootstrap','login'] as const) {
 test(`${mode} recovers from post-auth CSRF failure without repeating authentication`, async ({page}) => {
  let signedIn=false;let authPosts=0;let tokens=0;let sessionReads=0;
  await page.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname;
   if(path.endsWith('/status'))return route.fulfill({json:{requiresBootstrap:mode==='bootstrap'&&authPosts===0}});
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
  if(mode==='bootstrap')await page.getByLabel('Display name').fill(user.displayName);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password',{exact:true}).fill('fixture-only-password');
  await page.getByRole('button',{name:mode==='bootstrap'?'Create workspace':'Sign in',exact:true}).click();
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
test('first run creates an authenticated participant-first room and signs out', async ({page}) => {
 let signedIn = false; let bootstrap = true;
 await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (path.endsWith('/status')) return route.fulfill({json:{requiresBootstrap:bootstrap}});
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
 await expect(page.getByRole('button',{name:'Direct messages — coming next'})).toBeDisabled();
 await page.getByRole('button',{name:'Sign out'}).click();
 await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
});
