import { test, expect } from '@playwright/test';

test('launched API rejects foreign Host headers', async ({request}) => {
 test.skip(process.env.NEXUS_UI_TEST !== '1', 'Requires the disposable database harness');
 const response=await request.get('http://127.0.0.1:5081/api/auth/csrf',{headers:{Host:'untrusted.example'}});
 expect(response.status()).toBe(400);
});

// The parent harness sets this flag only for its disposable, isolated test DB.
// Never bootstrap from the normal developer server or a user's database.
test('real workspace bootstrap, persistence, logout and independent-context login', async ({ page, browser, baseURL }) => {
 test.skip(process.env.NEXUS_UI_TEST !== '1', 'Requires the disposable database harness: npm run test:live');
 expect(new URL(baseURL!).port).toBe('5176');
 const email = 'integration-admin@example.test';
 const password = 'fixture-only-strong-password-2026';
 const displayName = 'Integration Member';
 const body = `Persisted browser message ${crypto.randomUUID()}`;
 const newcomerEmail = 'second-human@example.test';
 const newcomerPassword = 'fixture-only-second-password-2026';
 const newcomerName = 'Second Human';
 const newcomerBody = `Second human message ${crypto.randomUUID()}`;
 const topicTitle = `Project room ${crypto.randomUUID().slice(0,8)}`;
 const topicDescription = 'A focused public conversation for Sprint 4.';
 const topicOpening = `Opening topic message ${crypto.randomUUID()}`;
 const topicDraft = `Draft preserved across rooms ${crypto.randomUUID()}`;
 let directId='';
 const privateBody=`Private A to B ${crypto.randomUUID()}`;
 const privateReply=`Private B reply ${crypto.randomUUID()}`;
 const newcomerTopicBody = `Second human topic reply ${crypto.randomUUID()}`;
 await page.goto('/');
 await expect(page.getByRole('heading', {name:'Bring your workspace to life'})).toBeVisible();
 await page.screenshot({path:'artifacts/live-setup.png',fullPage:true});
 await page.getByLabel('Display name').fill(displayName);
 await page.getByLabel('Email').fill(email);
 await page.getByLabel('Password', {exact:true}).fill(password);
 await page.getByRole('button', {name:'Create workspace'}).click();
 await expect(page.getByRole('heading', {name:'The Common Room'})).toBeVisible();
 await expect(page.getByText(`${displayName} (you)`, {exact:true})).toBeVisible();
 await page.getByLabel('Message the Common Room').fill(body);
 await page.getByRole('button', {name:'Send', exact:true}).click();
 await expect(page.getByLabel('Message the Common Room')).toHaveValue('');
 await expect(page.getByRole('log', {name:'Common Room messages'}).getByText(body, {exact:true})).toBeVisible();
 await page.reload();
 await expect(page.getByRole('log', {name:'Common Room messages'}).getByText(body, {exact:true})).toBeVisible();
 await page.screenshot({path:'artifacts/live-room.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await expect(page.getByLabel('Message the Common Room')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'artifacts/live-room-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:960});
 await page.getByRole('button', {name:'Topics'}).click();
 await page.getByRole('button', {name:'New topic'}).click();
 await page.getByLabel('Topic title').fill(topicTitle);
 await page.getByLabel('Description').fill(topicDescription);
 await page.getByLabel('Opening message').fill(topicOpening);
 await page.getByRole('button', {name:'Create topic'}).click();
 await expect(page.getByRole('heading', {name:topicTitle})).toBeVisible();
 await expect(page.getByText(topicOpening, {exact:true})).toBeVisible();
 const topicComposer = page.getByLabel(`Message ${topicTitle}`);
 await topicComposer.fill(topicDraft);
 await page.getByRole('button', {name:'Common room'}).click();
 const preservedMainDraft = `Main draft ${crypto.randomUUID()}`;
 await page.getByLabel('Message the Common Room').fill(preservedMainDraft);
 await page.getByRole('button', {name:topicTitle}).click();
 await expect(topicComposer).toHaveValue(topicDraft);
 await topicComposer.press('Enter');
 await expect(topicComposer).toHaveValue('');
 await expect(page.getByText(topicDraft, {exact:true})).toBeVisible();
 await page.getByRole('button', {name:'Common room'}).click();
 await expect(page.getByLabel('Message the Common Room')).toHaveValue(preservedMainDraft);
 await page.getByLabel('Message the Common Room').fill('');
 const newcomerContext = await browser.newContext({baseURL});
 try {
  const newcomer = await newcomerContext.newPage();
  await newcomer.goto('/');
  await expect(newcomer.getByRole('heading', {name:'Welcome back'})).toBeVisible();
  await newcomer.getByRole('tab', {name:'Create account'}).click();
  await newcomer.getByLabel('Display name').fill(newcomerName);
  await newcomer.getByLabel('Email').fill(newcomerEmail);
  await newcomer.getByLabel('Password', {exact:true}).fill(newcomerPassword);
  await newcomer.getByRole('button', {name:'Create account', exact:true}).click();
  await expect(newcomer.getByRole('heading', {name:'The Common Room'})).toBeVisible();
  await expect(newcomer.getByText(`${newcomerName} (you)`, {exact:true})).toBeVisible();
  await expect(newcomer.getByRole('log', {name:'Common Room messages'}).getByText(body, {exact:true})).toBeVisible();
  await newcomer.getByRole('button', {name:'Topics'}).click();
  await newcomer.getByRole('button', {name:topicTitle}).click();
  await expect(newcomer.getByText(topicOpening, {exact:true})).toBeVisible();
  await expect(newcomer.getByText(topicDraft, {exact:true})).toBeVisible();
  await page.getByRole('button', {name:topicTitle}).click();
  await newcomer.getByLabel(`Message ${topicTitle}`).fill(newcomerTopicBody);
  await newcomer.getByLabel(`Message ${topicTitle}`).press('Enter');
  await expect(newcomer.getByLabel(`Message ${topicTitle}`)).toHaveValue('');
  await expect(newcomer.getByText(newcomerTopicBody, {exact:true})).toBeVisible();
  await expect(page.getByText(newcomerTopicBody, {exact:true})).toBeVisible({timeout:7000});
  await newcomer.getByRole('button', {name:'Common room'}).click();
  await expect(page.getByRole('complementary', {name:'Workspace context'}).getByText(newcomerName, {exact:true})).toBeVisible({timeout:7000});
  await newcomer.getByLabel('Message the Common Room').fill(newcomerBody);
  await newcomer.getByRole('button', {name:'Send', exact:true}).click();
  await expect(newcomer.getByLabel('Message the Common Room')).toHaveValue('');
  await expect(newcomer.getByRole('log', {name:'Common Room messages'}).getByText(newcomerBody, {exact:true})).toBeVisible();
  await page.getByRole('button', {name:'Common room'}).click();
  await expect(page.getByRole('log', {name:'Common Room messages'}).getByText(newcomerBody, {exact:true})).toBeVisible({timeout:7000});
  // A creates the DM while B remains on Main; discovery must not steal selection.
  await page.getByRole('button',{name:'Direct messages',exact:true}).click();
  await page.getByRole('button',{name:'New message',exact:true}).click();
  await page.getByLabel('Recipient').selectOption({label:newcomerName});
  const createdDirect=page.waitForResponse(r=>r.url().endsWith('/api/conversations/direct')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Open conversation',exact:true}).click();
  const directResponse=await createdDirect;expect(directResponse.status()).toBe(200);directId=(await directResponse.json()).id;
  await expect(page.getByLabel(`Message ${newcomerName}`)).toBeFocused();
  await page.getByLabel(`Message ${newcomerName}`).fill(privateBody);await page.getByLabel(`Message ${newcomerName}`).press('Enter');
  await expect(page.getByLabel(`Message ${newcomerName}`)).toHaveValue('');
  await expect(page.getByRole('log').getByText(privateBody,{exact:true})).toBeVisible();
  await newcomer.getByRole('button',{name:'Direct messages',exact:true}).click();
  await expect(newcomer.getByRole('button',{name:displayName,exact:true})).toBeVisible({timeout:8000});
  await expect(newcomer.getByLabel('Message the Common Room')).toBeVisible();
  await newcomer.getByRole('button',{name:displayName,exact:true}).click();
  await expect(newcomer.getByRole('log').getByText(privateBody,{exact:true})).toBeVisible();
  await newcomer.getByLabel(`Message ${displayName}`).fill(privateReply);await newcomer.getByLabel(`Message ${displayName}`).press('Enter');
  await expect(newcomer.getByLabel(`Message ${displayName}`)).toHaveValue('');
  await expect(page.getByRole('log').getByText(privateReply,{exact:true})).toBeVisible({timeout:8000});
  for(const [client,other] of [[page,newcomerName],[newcomer,displayName]] as const){
   await client.getByLabel(`Message ${other}`).fill('DM isolated draft');
   await client.getByRole('button',{name:'Common room',exact:true}).click();await client.getByLabel('Message the Common Room').fill('Main isolated draft');
   await client.getByRole('button',{name:'Topics',exact:true}).click();await client.getByRole('button',{name:topicTitle,exact:true}).click();await client.getByLabel(`Message ${topicTitle}`).fill('Topic isolated draft');
   await client.getByRole('button',{name:'Direct messages',exact:true}).click();await client.getByRole('button',{name:other,exact:true}).click();await expect(client.getByLabel(`Message ${other}`)).toHaveValue('DM isolated draft');
   await client.getByRole('button',{name:'Topics',exact:true}).click();await client.getByRole('button',{name:topicTitle,exact:true}).click();await expect(client.getByLabel(`Message ${topicTitle}`)).toHaveValue('Topic isolated draft');
   await client.getByRole('button',{name:'Common room',exact:true}).click();await expect(client.getByLabel('Message the Common Room')).toHaveValue('Main isolated draft');
  }
  const thirdContext=await browser.newContext({baseURL});
  try{
   const third=await thirdContext.newPage();await third.goto('/');await third.getByRole('tab',{name:'Create account'}).click();
   await third.getByLabel('Display name').fill('Third Human');await third.getByLabel('Email').fill('third@example.test');await third.getByLabel('Password',{exact:true}).fill('fixture-only-third-password-2026');await third.getByRole('button',{name:'Create account',exact:true}).click();
   await expect(third.getByLabel('Message the Common Room')).toBeVisible();await third.getByRole('button',{name:'Direct messages',exact:true}).click();
   await expect(third.locator('#direct-list button')).toHaveCount(1);
   const home=await thirdContext.request.get('/api/workspace/home');expect((await home.json()).conversations.some((c:{id:string})=>c.id===directId)).toBe(false);
   const csrf=await thirdContext.request.get('/api/auth/csrf');const token=(await csrf.json()).token;
   for(const response of [await thirdContext.request.get(`/api/conversations/${directId}/messages`),await thirdContext.request.post(`/api/conversations/${directId}/messages`,{headers:{'X-CSRF-TOKEN':token},data:{body:'Forbidden',clientRequestId:crypto.randomUUID()}})]){
    expect(response.status()).toBe(403);const text=await response.text();expect(text).not.toContain(privateBody);expect(text).not.toContain(privateReply);
   }
   for(const context of [page.context(),newcomerContext]){const response=await context.request.get(`/api/conversations/${directId}/messages`);expect(response.status()).toBe(200);expect(await response.text()).toContain(privateBody);}
  }finally{await thirdContext.close();}
  await newcomer.getByRole('button', {name:'Sign out'}).click();
  await newcomer.getByLabel('Email').fill(newcomerEmail);
  await newcomer.getByLabel('Password', {exact:true}).fill(newcomerPassword);
  await newcomer.getByRole('button', {name:'Sign in', exact:true}).click();
  await expect(newcomer.getByRole('log', {name:'Common Room messages'}).getByText(body, {exact:true})).toBeVisible();
  await expect(newcomer.getByRole('log', {name:'Common Room messages'}).getByText(newcomerBody, {exact:true})).toBeVisible();
  await newcomer.getByRole('button', {name:'Topics'}).click();
  await newcomer.getByRole('button', {name:topicTitle}).click();
  await expect(newcomer.getByText(topicOpening, {exact:true})).toBeVisible();
  await expect(newcomer.getByText(topicDraft, {exact:true})).toBeVisible();
  await expect(newcomer.getByText(newcomerTopicBody, {exact:true})).toBeVisible();
  await newcomer.getByRole('button',{name:'Direct messages',exact:true}).click();await newcomer.getByRole('button',{name:displayName,exact:true}).click();
  await expect(newcomer.getByRole('log').getByText(privateBody,{exact:true})).toBeVisible();await expect(newcomer.getByRole('log').getByText(privateReply,{exact:true})).toBeVisible();
 } finally { await newcomerContext.close(); }
 await page.getByRole('button', {name:'Sign out'}).click();
 await expect(page.getByRole('heading', {name:'Welcome back'})).toBeVisible();
 await expect(page.getByText(body, {exact:true})).toHaveCount(0);
 const independent = await browser.newContext({baseURL});
 try {
  const login = await independent.newPage();
  await login.goto('/');
  await expect(login.getByRole('heading', {name:'Welcome back'})).toBeVisible();
  await login.getByLabel('Email').fill(email);
  await login.getByLabel('Password', {exact:true}).fill(password);
  await login.getByRole('button', {name:'Sign in', exact:true}).click();
  await expect(login.getByRole('log', {name:'Common Room messages'}).getByText(body, {exact:true})).toBeVisible();
  await expect(login.getByRole('log', {name:'Common Room messages'}).getByText(newcomerBody, {exact:true})).toBeVisible();
  await expect(login.getByText('Local · connected', {exact:true})).toBeVisible();
  const second = `Second session ${crypto.randomUUID()}`;
  await login.getByLabel('Message the Common Room').fill(second);
  await login.getByLabel('Message the Common Room').press('Enter');
  await expect(login.getByLabel('Message the Common Room')).toHaveValue('');
  await expect(login.getByRole('log', {name:'Common Room messages'}).getByText(second, {exact:true})).toBeVisible();
  await login.reload();
  await expect(login.getByRole('log', {name:'Common Room messages'}).getByText(second, {exact:true})).toBeVisible();
  await login.getByRole('button', {name:'Topics'}).click();
  await login.getByRole('button', {name:topicTitle}).click();
  await expect(login.getByText(topicOpening, {exact:true})).toBeVisible();
  await expect(login.getByText(topicDraft, {exact:true})).toBeVisible();
  await expect(login.getByText(newcomerTopicBody, {exact:true})).toBeVisible();
  await login.getByRole('button',{name:'Direct messages',exact:true}).click();await login.getByRole('button',{name:newcomerName,exact:true}).click();
  await expect(login.getByRole('log').getByText(privateBody,{exact:true})).toBeVisible();await expect(login.getByRole('log').getByText(privateReply,{exact:true})).toBeVisible();
  await login.getByRole('button', {name:'Sign out'}).click();
  await expect(login.getByRole('heading', {name:'Welcome back'})).toBeVisible();
 } finally { await independent.close(); }
});
