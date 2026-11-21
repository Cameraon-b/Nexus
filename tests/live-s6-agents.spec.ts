import {test,expect} from '@playwright/test';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

test('three contexts keep agent replies pending and revoke connector access immediately',async({page,browser,baseURL,playwright})=>{
 if(process.env.NEXUS_UI_TEST!=='1'||!/^nexus_ui_test_[a-f0-9]+$/.test(process.env.NEXUS_UI_DATABASE??''))throw new Error('Requires disposable live harness');
 const db=process.env.NEXUS_UI_DATABASE!;
 const suffix=crypto.randomUUID().slice(0,8),email=`agent-admin-${suffix}@example.test`,password='Disposable-admin-only-password-2026';
 await page.goto('/');
 await expect(page.getByRole('heading',{level:1})).toBeVisible();
 // This spec owns first bootstrap when run alone or first in the full suite.
 if(await page.getByRole('heading',{name:'Bring your workspace to life'}).isVisible()){
  await page.getByLabel('Display name').fill('Agent Test Admin');await page.getByLabel('Email').fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Create workspace'}).click();
 }else{
  await page.getByLabel('Email').fill('integration-admin@example.test');await page.getByLabel('Password',{exact:true}).fill('fixture-only-strong-password-2026');await page.getByRole('button',{name:'Sign in',exact:true}).click();
 }
 await expect(page.getByRole('heading',{name:'The Common Room'})).toBeVisible();
 await page.getByRole('button',{name:'Manage agents',exact:true}).click();await page.getByRole('button',{name:'Create agent',exact:true}).click();
 const name=`Live agent ${suffix}`;
 await page.getByLabel('Agent display name').fill(name);await page.getByLabel('Description',{exact:true}).fill('Disposable reference connector');await page.getByLabel('Token label').fill('Acceptance connector');
 const creation=page.waitForResponse(r=>r.url().endsWith('/api/admin/agents')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Create',exact:true}).click();const created=await (await creation).json();
 const raw=await page.getByLabel('Integration token',{exact:true}).inputValue();const agentId=created.agent.id;
 await page.getByRole('button',{name:'Done',exact:true}).click();await page.getByRole('button',{name:'Close manage agents',exact:true}).click();
 const humanContext=await browser.newContext({baseURL});const connector=await playwright.request.newContext({baseURL,extraHTTPHeaders:{Authorization:`Bearer ${raw}`}});
 try{
  const human=await humanContext.newPage();await human.goto('/');await human.getByRole('tab',{name:'Create account'}).click();await human.getByLabel('Display name').fill(`Ordinary ${suffix}`);await human.getByLabel('Email').fill(`ordinary-${suffix}@example.test`);await human.getByLabel('Password',{exact:true}).fill('Disposable-human-password-2026');await human.getByRole('button',{name:'Create account',exact:true}).click();
  await expect(human.getByRole('heading',{name:'The Common Room'})).toBeVisible();await expect(human.getByRole('button',{name:'Manage agents'})).toHaveCount(0);
  await human.getByRole('button',{name:'Direct messages',exact:true}).click();await human.getByRole('button',{name:'New message',exact:true}).click();
  await expect(human.getByLabel('Recipient').locator(`option[value="${agentId}"]`)).toContainText('AGENT · unknown');await human.getByLabel('Recipient').selectOption(agentId);
  const direct=human.waitForResponse(r=>r.url().endsWith('/api/conversations/direct')&&r.request().method()==='POST');await human.getByRole('button',{name:'Open conversation'}).click();const conversationId=(await (await direct).json()).id;
  const input=`Human connector input ${suffix}`;await human.getByLabel(`Message ${name}`).fill(input);await human.getByLabel(`Message ${name}`).press('Enter');await expect(human.getByRole('log').getByText(input,{exact:true})).toBeVisible();
  expect((await connector.get('/api/integrations/me')).status()).toBe(200);
  const inbox=await connector.get('/api/integrations/inbox');expect(inbox.status()).toBe(200);const messages=(await inbox.json()).messages;const source=messages.find((m:{body:string})=>m.body===input);expect(Boolean(source)).toBe(true);
  // Any private messages returned must belong to this agent's canonical pair.
  const home=await humanContext.request.get('/api/workspace/home');const conversations=(await home.json()).conversations;
  for(const message of messages){const room=conversations.find((c:{id:string})=>c.id===message.conversationId);expect(Boolean(room)).toBe(true);if(room.kind==='direct')expect(room.participantIds.includes(agentId)).toBe(true);}
  const body=`Pending connector proposal ${suffix}`,clientRequestId=crypto.randomUUID();
  const draft=await connector.post('/api/integrations/drafts',{data:{conversationId,body,clientRequestId,sourceMessageId:source.id}});expect(draft.status()).toBe(200);expect((await draft.json()).state).toBe('pending');
  const query=`SELECT json_build_object('hash', (SELECT "TokenHash" FROM "IntegrationTokens" WHERE "ParticipantId"='${agentId}'), 'pending', (SELECT count(*) FROM "MessageDrafts" WHERE "AuthorId"='${agentId}' AND "State"='pending'), 'delivered', (SELECT count(*) FROM "Messages" WHERE "AuthorId"='${agentId}'))`;
  const result=spawnSync('docker',['exec','nexus-postgres-1','psql','-U','nexus','-d',db,'-tA','-v','ON_ERROR_STOP=1','-c',query],{encoding:'utf8'});expect(result.status).toBe(0);const stored=JSON.parse(result.stdout.trim());
  expect(stored.hash===createHash('sha256').update(raw).digest('hex').toUpperCase()).toBe(true);expect(stored.pending).toBe(1);expect(stored.delivered).toBe(0);
  await page.getByRole('button',{name:'Manage agents',exact:true}).click();const panel=page.getByRole('dialog',{name:'Manage agents',exact:true});await expect(panel.getByText('Pending replies: 1',{exact:true})).toBeVisible({timeout:8000});await expect(panel).not.toContainText(body);
  const refreshed=human.waitForResponse(r=>r.url().endsWith(`/api/conversations/${conversationId}/messages`));await refreshed;await expect(human.getByRole('log')).not.toContainText(body);expect(await (await humanContext.request.get(`/api/conversations/${conversationId}/messages`)).text()).not.toContain(body);
  await panel.getByRole('button',{name:'Revoke token',exact:true}).click();await page.getByRole('button',{name:'Confirm revoke',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Token revoked'})).toBeVisible();
  for(const path of ['/me','/inbox','/drafts'])expect((await connector.get('/api/integrations'+path)).status()).toBe(401);
  expect((await connector.post('/api/integrations/drafts',{data:{conversationId,body,clientRequestId}})).status()).toBe(401);
 }finally{await connector.dispose();await humanContext.close();}
});
