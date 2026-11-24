import {test,expect} from '@playwright/test';
import {spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {composeEnvironment} from '../scripts/production-environment.mjs';

test('isolated HTTPS production bootstrap, closed registration, governed release and persistence',async({page,context,playwright,baseURL})=>{
 const project=process.env.NEXUS_ACCEPT_PROJECT!;
 if(!/^nexus_s8_[a-f0-9]{12}$/.test(project)||!baseURL?.startsWith('https://localhost:'))throw new Error('Isolated production harness required');
 const email='production-admin@example.test',password=randomBytes(24).toString('base64url');
 await page.goto('/');await expect(page.getByRole('heading',{name:'Bring your workspace to life'})).toBeVisible();
 expect((await page.request.get('/health/live')).status()).toBe(200);expect((await page.request.get('/health/ready')).status()).toBe(200);
 const demo=await context.newPage();let apiCalls=0;demo.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))apiCalls++;});await demo.goto('/demo');await expect(demo.locator('body')).toContainText('nexus');expect(apiCalls).toBe(0);await demo.close();
 await page.getByLabel('Display name').fill('Production Admin');await page.getByLabel('Email').fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Create workspace'}).click();
 await expect(page.getByRole('heading',{name:'The Common Room'})).toBeVisible();
 const cookies=await context.cookies();for(const name of ['nexus.session','nexus.csrf']){const cookie=cookies.find(c=>c.name===name);expect(Boolean(cookie?.secure&&cookie?.httpOnly&&cookie?.sameSite==='Strict')).toBe(true);}
 let csrf=(await (await page.request.get('/api/auth/csrf')).json()).token;
 expect((await (await page.request.get('/api/auth/status')).json()).registrationAvailable).toBe(false);
 expect((await page.request.post('/api/auth/register',{headers:{'X-CSRF-TOKEN':csrf},data:{displayName:'Blocked',email:'blocked@example.test',password}})).status()).toBe(403);
 await page.getByRole('button',{name:'Sign out'}).click();await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();await expect(page.getByRole('tab',{name:'Create account'})).toHaveCount(0);
 await page.getByLabel('Email').fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:'The Common Room'})).toBeVisible();
 csrf=(await (await page.request.get('/api/auth/csrf')).json()).token;
 await page.getByRole('button',{name:'Topics',exact:true}).click();await page.getByRole('button',{name:'New topic',exact:true}).click();await page.getByLabel('Topic title').fill('Production topic');await page.getByLabel('Description',{exact:true}).fill('Disposable topic');await page.getByLabel('Opening message').fill('Production opening');await page.getByRole('button',{name:'Create topic',exact:true}).click();
 await page.getByLabel('Message Production topic').fill('Production topic message');await page.getByLabel('Message Production topic').press('Enter');await expect(page.getByRole('log').getByText('Production topic message',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Manage agents',exact:true}).click();await page.getByRole('button',{name:'Create agent',exact:true}).click();await expect(page.getByLabel('Agent display name')).toBeFocused();await page.getByLabel('Agent display name').fill('Production agent');await page.getByLabel('Description',{exact:true}).fill('Disposable production acceptance');await page.getByLabel('Token label').fill('Acceptance connector');
 const creation=page.waitForResponse(r=>r.url().endsWith('/api/admin/agents')&&r.request().method()==='POST');await page.getByRole('button',{name:'Create',exact:true}).click();const agent=await (await creation).json();
 await page.getByRole('button',{name:'Done',exact:true}).click();await page.getByRole('button',{name:'Close manage agents',exact:true}).click();
 const connector=await playwright.request.newContext({baseURL,ignoreHTTPSErrors:true,extraHTTPHeaders:{Authorization:`Bearer ${agent.rawToken}`}});
 try{
  await page.getByRole('button',{name:'Direct messages',exact:true}).click();await page.getByRole('button',{name:'New message',exact:true}).click();await page.getByLabel('Recipient').selectOption(agent.agent.id);
  const direct=page.waitForResponse(r=>r.url().endsWith('/api/conversations/direct')&&r.request().method()==='POST');await page.getByRole('button',{name:'Open conversation'}).click();const cid=(await (await direct).json()).id;
  await page.getByLabel('Message Production agent').fill('Production human source');await page.getByLabel('Message Production agent').press('Enter');await expect(page.getByRole('log').getByText('Production human source',{exact:true})).toBeVisible();
  const inbox=await connector.get('/api/integrations/inbox');expect(inbox.status()).toBe(200);const source=(await inbox.json()).messages.find((m:{body:string})=>m.body==='Production human source');expect(Boolean(source)).toBe(true);
  const proposal=await connector.post('/api/integrations/drafts',{data:{conversationId:cid,body:'Production agent release',sourceMessageId:source.id,clientRequestId:crypto.randomUUID()}});expect(proposal.status()).toBe(200);
  await page.getByRole('button',{name:/^Review queue,/}).click();await page.getByRole('button').filter({hasText:'Production agent release'}).click();await page.getByRole('button',{name:'Approve unchanged',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Proposal resolved: approved.'})).toBeVisible();
  await page.getByRole('button',{name:'Close review queue',exact:true}).click();
  await expect(page.getByRole('log').getByText('Production agent release',{exact:true})).toBeVisible({timeout:12000});
  const delivered=await (await page.request.get(`/api/conversations/${cid}/messages`)).json();const released=delivered.find((m:{body:string})=>m.body==='Production agent release');expect(released.authorId).toBe(agent.agent.id);expect(released.approvedThroughReview).toBe(true);
  function compose(args:string[]){const r=spawnSync('docker',['compose','-p',project,'--env-file',process.env.NEXUS_ACCEPT_ENV!,'-f','deployment/compose.production.yaml',...args],{encoding:'utf8',env:composeEnvironment()});if(r.status!==0)throw new Error('Acceptance lifecycle operation failed');return r.stdout;}
  const keyFingerprint=()=>createHash('sha256').update(compose(['exec','-T','api','sh','-ec','sha256sum /keys/*'])).digest('hex');
  const keysBefore=keyFingerprint();
  compose(['restart','frontend','api']);
  await expect.poll(async()=>{try{return (await page.request.get('/health/ready')).status();}catch{return 0;}},{timeout:60000}).toBe(200);
  expect((await page.request.get('/api/auth/me')).status()).toBe(200);expect((await page.request.post('/api/conversations/topical',{headers:{'X-CSRF-TOKEN':csrf},data:{title:'Post-restart topic',description:'Persistent keys check',openingMessage:'Post restart',clientRequestId:crypto.randomUUID()}})).status()).toBe(200);
  compose(['restart','postgres']);await expect.poll(async()=>{try{return (await page.request.get('/health/ready')).status();}catch{return 0;}},{timeout:60000}).toBe(200);
  expect(keyFingerprint()).toBe(keysBefore);
  expect((await page.request.get('/api/auth/me')).status()).toBe(200);const persisted=await (await page.request.get(`/api/conversations/${cid}/messages`)).json();expect(persisted.some((m:{body:string})=>m.body==='Production agent release')).toBe(true);
  await page.reload();await expect(page.getByRole('heading',{name:'The Common Room'})).toBeVisible();
 }finally{await connector.dispose();}
});
