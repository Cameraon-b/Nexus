import { test, expect } from '@playwright/test';

test('finds a conversation and opens its context', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Search conversations' }).click();
  await page.getByPlaceholder('Search this prototype’s conversations…').fill('field');
  await page.locator('.search-results').getByRole('button', {name: /AETHER field notes/}).click();
  await expect(page.getByRole('heading', {name:'AETHER field notes',exact:true})).toBeVisible();
});

test('mobile navigation remains named and readable', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.getByRole('button',{name:'Participants',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Participants',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Common room',exact:true}).click();
  expect(await page.locator('.message-content p').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('rejected draft content remains inspectable only in review history', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button',{name:'Open review queue',exact:true}).click();
  await page.getByRole('button',{name:'Reject',exact:true}).click();
  await page.getByRole('button',{name:'Review history',exact:true}).click();
  await expect(page.locator('.history-card')).toContainText('I have a small prototype direction');
  await expect(page.locator('.history-card')).toContainText('rejected');
  await page.getByRole('button',{name:'Common room',exact:true}).click();
  await expect(page.locator('.timeline')).not.toContainText('I have a small prototype direction');
});

test('blocked agent draft attempt shows an error without losing workspace', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:'Open review queue',exact:true}).click();
  await page.locator('.governance-tabs').getByRole('button',{name:'Participants',exact:true}).click();
  await page.locator('.participant-admin-row').filter({hasText:'Hermes'}).getByRole('button',{name:'Block',exact:true}).click();
  await page.getByRole('button',{name:'Common room',exact:true}).click();
  await page.getByRole('button',{name:'Preview agent draft',exact:true}).click();
  await expect(page.locator('.toast')).toContainText('not allowed');
  await expect(page.getByRole('heading',{name:'The Common Room',exact:true})).toBeVisible();
});

test('agent draft can be previewed and reviewed in a direct conversation', async ({page}) => {
  await page.goto('/');
  await page.locator('.participant-stack').getByRole('button',{name:/Hermes/}).click();
  await page.getByRole('textbox',{name:'Write a direct message'}).fill('Hello Hermes');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByRole('button',{name:'Preview agent draft',exact:true}).click();
  await page.locator('.draft-edit-label textarea').fill('Reviewed DM reply');
  await page.getByRole('button',{name:'Approve with edits',exact:true}).click();
  await page.getByRole('button',{name:'Direct messages',exact:true}).click();
  await expect(page.locator('.dm-messages')).toContainText('Reviewed DM reply');
  await expect(page.locator('.dm-messages')).toContainText('Admin-edited');
});

test('opening a topic clears its unread indicator across reloads', async ({page}) => {
  await page.goto('/');
  const topic = page.locator('.topic-links').getByRole('button',{name:/Nexus · first mile/});
  await expect(topic.locator('.unread-badge')).toHaveText('1');
  await topic.click();
  await expect(topic.locator('.unread-badge')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.topic-links').getByRole('button',{name:/Nexus · first mile/}).locator('.unread-badge')).toHaveCount(0);
});

test('malformed saved state does not blank the app', async ({page}) => {
  await page.addInitScript(()=>localStorage.setItem('nexus-prototype-state-v1','{}'));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'The Common Room',exact:true})).toBeVisible();
});

test('reset requires confirmation and cancellation preserves messages', async ({page}) => {
  await page.goto('/');
  await page.getByRole('textbox',{name:'Write a message',exact:true}).fill('Keep this message');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  let prompted=false;
  page.on('dialog',async dialog=>{prompted=true;await dialog.dismiss();});
  await page.getByRole('button',{name:'Reset demo workspace',exact:true}).click();
  expect(prompted).toBe(true);
  await expect(page.locator('.timeline')).toContainText('Keep this message');
});

test('creates a topic, posts, and restores history after reload', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:'Create a topical conversation',exact:true}).click();
  await page.getByLabel('Conversation title').fill('Prototype feedback');
  await page.getByLabel('Opening message').fill('Let us refine this together.');
  await page.getByRole('button',{name:'Create conversation',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Prototype feedback',exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'Write a message',exact:true}).fill('Second thought');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.reload();
  await page.locator('.topic-links').getByRole('button',{name:'Prototype feedback'}).click();
  await expect(page.locator('.timeline')).toContainText('Second thought');
});

test('policy auto-release appears without a review and retains original authorship',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Open review queue',exact:true}).click();
 await page.getByRole('button',{name:'Agent policy',exact:true}).click();
 await page.getByRole('switch',{name:'Require approval for Hermes'}).click();
 await page.getByRole('button',{name:'Common room',exact:true}).click();
 await page.getByRole('button',{name:'Preview agent draft',exact:true}).click();
 await expect(page.locator('.timeline').getByText('Demo reply:',{exact:false})).toBeVisible();
 await expect(page.locator('.message-row').last()).toContainText('Hermes');
});

test('conversation drafts stay with their destination', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Write a message', exact: true }).fill('Unsent in Main');
  await page.locator('.topic-links').getByRole('button', { name: 'Nexus · first mile' }).click();
  await expect(page.getByRole('textbox', { name: 'Write a message', exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Common room', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Write a message', exact: true })).toHaveValue('Unsent in Main');
});
