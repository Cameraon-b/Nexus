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
 await expect(page.getByText(body, {exact:true})).toBeVisible();
 await page.reload();
 await expect(page.getByText(body, {exact:true})).toBeVisible();
 await page.screenshot({path:'artifacts/live-room.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await expect(page.getByLabel('Message the Common Room')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'artifacts/live-room-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:960});
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
  await expect(login.getByText(body, {exact:true})).toBeVisible();
  await expect(login.getByText('Local · connected', {exact:true})).toBeVisible();
  const second = `Second session ${crypto.randomUUID()}`;
  await login.getByLabel('Message the Common Room').fill(second);
  await login.getByLabel('Message the Common Room').press('Enter');
  await expect(login.getByText(second, {exact:true})).toBeVisible();
  await login.reload();
  await expect(login.getByText(second, {exact:true})).toBeVisible();
  await login.getByRole('button', {name:'Sign out'}).click();
  await expect(login.getByRole('heading', {name:'Welcome back'})).toBeVisible();
 } finally { await independent.close(); }
});
