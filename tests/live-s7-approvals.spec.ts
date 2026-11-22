import {test,expect} from '@playwright/test';

test('live governed human → connector → admin → human release journey',async({page,browser,baseURL,playwright})=>{
 if(process.env.NEXUS_UI_TEST!=='1'||!/^nexus_ui_test_[a-f0-9]{32}$/.test(process.env.NEXUS_UI_DATABASE??''))throw new Error('Disposable harness required');
 const suffix=crypto.randomUUID().slice(0,8),name=`Review agent ${suffix}`;
 const email='integration-admin@example.test',password='fixture-only-strong-password-2026';
 await page.goto('/');await expect(page.getByRole('heading',{level:1})).toBeVisible();
 if(await page.getByRole('heading',{name:'Bring your workspace to life'}).isVisible()){
  await page.getByLabel('Display name').fill('Review Admin');await page.getByLabel('Email').fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Create workspace'}).click();
 }else{await page.getByLabel('Email').fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();}
 await expect(page.getByRole('heading',{name:'The Common Room'})).toBeVisible();
 const csrf=(await (await page.request.get('/api/auth/csrf')).json()).token;
 const create=await page.request.post('/api/admin/agents',{headers:{'X-CSRF-TOKEN':csrf},data:{displayName:name,description:'Disposable review acceptance',tokenLabel:'Connector'}});expect(create.status()).toBe(200);const agent=await create.json();
 const humanContext=await browser.newContext({baseURL});let connector=await playwright.request.newContext({baseURL,extraHTTPHeaders:{Authorization:`Bearer ${agent.rawToken}`}});
 try{
  const human=await humanContext.newPage();await human.goto('/');await human.getByRole('tab',{name:'Create account'}).click();await human.getByLabel('Display name').fill(`Human ${suffix}`);await human.getByLabel('Email').fill(`review-human-${suffix}@example.test`);await human.getByLabel('Password',{exact:true}).fill('Disposable-review-human-password-2026');await human.getByRole('button',{name:'Create account',exact:true}).click();
  await expect(human.getByRole('heading',{name:'The Common Room'})).toBeVisible();await expect(human.getByRole('button',{name:/^Review queue,/})).toHaveCount(0);
  await human.getByRole('button',{name:'Direct messages',exact:true}).click();await human.getByRole('button',{name:'New message',exact:true}).click();await human.getByLabel('Recipient').selectOption(agent.agent.id);
  const direct=human.waitForResponse(r=>r.url().endsWith('/api/conversations/direct')&&r.request().method()==='POST');await human.getByRole('button',{name:'Open conversation'}).click();const cid=(await (await direct).json()).id;
  const input=`Human source ${suffix}`;await human.getByLabel(`Message ${name}`).fill(input);await human.getByLabel(`Message ${name}`).press('Enter');await expect(human.getByRole('log').getByText(input,{exact:true})).toBeVisible();
  const source=(await (await connector.get('/api/integrations/inbox')).json()).messages.find((m:{body:string})=>m.body===input);expect(source).toBeTruthy();
  async function propose(body:string){const response=await connector.post('/api/integrations/drafts',{data:{conversationId:cid,body,clientRequestId:crypto.randomUUID(),sourceMessageId:source.id}});expect(response.status()).toBe(200);return (await response.json()).id;}
  const unchanged=`Unchanged proposal ${suffix}`,original=`Original edit proposal ${suffix}`,edited=`Final edited release ${suffix}`,rejected=`Rejected proposal ${suffix}`;
  const ids=[await propose(unchanged),await propose(original),await propose(rejected)];
  expect((await humanContext.request.get('/api/admin/approvals')).status()).toBe(403);expect((await connector.get('/api/admin/approvals')).status()).toBe(401);
  expect((await page.request.post(`/api/admin/approvals/${ids[0]}/decision`,{data:{outcome:'approved',clientRequestId:crypto.randomUUID()}})).status()).toBe(400);
  expect(await (await humanContext.request.get(`/api/conversations/${cid}/messages`)).text()).not.toContain('proposal');
  await page.getByRole('button',{name:/^Review queue,/}).click();
  async function select(body:string){await page.getByRole('button').filter({hasText:body}).click();await expect(page.getByRole('heading',{name:'Original proposal'})).toBeVisible();await expect(page.getByText(input,{exact:true})).toHaveCount(2);}
  await select(unchanged);await page.getByRole('button',{name:'Approve unchanged',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Proposal resolved: approved.'})).toBeVisible();
  await expect(human.getByRole('log').getByText(unchanged,{exact:true})).toBeVisible({timeout:12000});await expect(human.getByRole('log').getByText(unchanged,{exact:true})).toHaveCount(1);
  await select(original);await page.getByLabel('Final message body').fill(edited);await page.getByRole('button',{name:'Approve with edits',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'approved_with_edits'})).toBeVisible();
  await expect(human.getByRole('log').getByText(edited,{exact:true})).toBeVisible({timeout:12000});await expect(human.getByText('Admin-edited before release · agent-authored')).toBeVisible();
  await select(rejected);await page.getByRole('button',{name:'Reject',exact:true}).click();await page.getByLabel('Reason (optional, private)').fill('Private acceptance reason');await page.getByRole('button',{name:'Confirm reject'}).click();await expect(page.getByRole('status').filter({hasText:'rejected'})).toBeVisible();
  await page.getByRole('button',{name:'History',exact:true}).click();await page.getByRole('button').filter({hasText:original}).click();await expect(page.getByText(original,{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Final wording'}).locator('+ p')).toHaveText(edited);
  const ordinary=await (await humanContext.request.get(`/api/conversations/${cid}/messages`)).json();expect(ordinary.filter((m:{body:string})=>m.body===unchanged)).toHaveLength(1);expect(ordinary.filter((m:{body:string})=>m.body===edited)).toHaveLength(1);expect(JSON.stringify(ordinary)).not.toContain(original);expect(JSON.stringify(ordinary)).not.toContain(rejected);expect(JSON.stringify(ordinary)).not.toContain('Private acceptance reason');
  const outcomes=await (await connector.get('/api/integrations/drafts')).json();expect(outcomes.map((d:{state:string})=>d.state).sort()).toEqual(['approved','approved_with_edits','rejected']);expect(JSON.stringify(outcomes)).not.toMatch(/reviewer|reason|body/i);
  const terminal=await (await page.request.get(`/api/admin/approvals/${ids[0]}`)).json();const decision=terminal.decision;
  const exact=await page.request.post(`/api/admin/approvals/${ids[0]}/decision`,{headers:{'X-CSRF-TOKEN':csrf},data:{outcome:'approved',clientRequestId:decision.clientRequestId}});expect(exact.status()).toBe(200);expect((await exact.json()).deliveredMessageId).toBe(decision.deliveredMessageId);
  expect((await page.request.post(`/api/admin/approvals/${ids[0]}/decision`,{headers:{'X-CSRF-TOKEN':csrf},data:{outcome:'rejected',clientRequestId:decision.clientRequestId}})).status()).toBe(409);
  const raceId=await propose(`Race proposal ${suffix}`);const races=await Promise.all(['approved','rejected'].map(outcome=>page.request.post(`/api/admin/approvals/${raceId}/decision`,{headers:{'X-CSRF-TOKEN':csrf},data:{outcome,clientRequestId:crypto.randomUUID()}})));expect(races.map(r=>r.status()).sort()).toEqual([200,409]);
  const replace=await page.request.post(`/api/admin/agents/${agent.agent.id}/tokens`,{headers:{'X-CSRF-TOKEN':csrf},data:{label:'Replacement',expectedTokenId:agent.token.id}});expect(replace.status()).toBe(200);const replacement=await replace.json();expect((await connector.get('/api/integrations/drafts')).status()).toBe(401);await connector.dispose();connector=await playwright.request.newContext({baseURL,extraHTTPHeaders:{Authorization:`Bearer ${replacement.rawToken}`}});expect((await (await connector.get('/api/integrations/drafts')).json()).length).toBe(4);
  expect((await page.request.post(`/api/admin/integration-tokens/${replacement.token.id}/revoke`,{headers:{'X-CSRF-TOKEN':csrf},data:{}})).status()).toBe(204);expect((await connector.get('/api/integrations/drafts')).status()).toBe(401);
 }finally{await connector.dispose();await humanContext.close();}
});
