import {test,expect,Page,Route} from '@playwright/test';
const agent={id:'agent',name:'Mira fixture',kind:'agent',state:'active',isAdmin:false};
const human={id:'human',name:'Admin',kind:'human',state:'active',isAdmin:true};
const destination={id:'private',title:'Private destination',kind:'direct',state:'active',participantIds:['human','agent']};
const draft=(id='one')=>({id,body:`Proposal ${id}`,state:'pending',createdAt:'2026-01-01T00:00:00Z',authorId:'agent',conversationId:'private'});
const detail=(id='one',state='pending')=>({draft:{...draft(id),state},agent,destination,recipients:[human,agent],sourceMessage:{id:'source',authorId:'human',createdAt:'2026-01-01T01:00:00Z',body:'Human source'},context:[{id:'context',authorId:'agent',createdAt:'2026-01-01T02:00:00Z',body:'Relevant delivered context'}],decision:state==='pending'?null:{outcome:state,finalBody:state==='rejected'?null:'Released',resolvedAt:'2026-01-02T00:00:00Z',reason:'Private note',deliveredMessageId:'message'},reviewer:state==='pending'?null:human});
async function setup(page:Page,admin=true){
 let resolved=false;let state='approved';let posts=0;
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/status'))return route.fulfill({json:{requiresBootstrap:false}});
  if(path.endsWith('/me'))return route.fulfill({json:{id:'account',participantId:'human',displayName:'Admin',isAdmin:admin}});
  if(path.endsWith('/csrf'))return route.fulfill({json:{token:'csrf'}});
  if(path.endsWith('/home'))return route.fulfill({json:{participants:[human,agent],conversation:{...destination,id:'main',title:'Main',kind:'main'},conversations:[],messages:[{id:'released',authorId:'agent',body:'Old released message',createdAt:'2026-01-01T00:00:00Z',approvedThroughReview:true,editedBeforeRelease:true}]}});
  if(path==='/api/admin/approvals'){
   const history=new URL(route.request().url()).searchParams.get('status')==='resolved';
   return route.fulfill({json:{items:history?(resolved?[{draft:{...draft(),state},agent,destination}]:[]):resolved?[]:[{draft:draft(),agent,destination}],nextCursor:null,pendingCount:resolved?0:1}});
  }
  if(path.endsWith('/decision')){posts++;state=route.request().postDataJSON().outcome;resolved=true;return route.fulfill({json:detail('one',state).decision});}
  if(path.startsWith('/api/admin/approvals/'))return route.fulfill({json:detail('one',resolved?state:'pending')});
  return route.fulfill({json:[]});
 });
 await page.goto('/');return {posts:()=>posts};
}
async function open(page:Page){await page.getByRole('button',{name:/^Review queue,/}).click();await page.getByRole('button',{name:/Mira fixture.*Private destination/}).click();await expect(page.getByRole('heading',{name:'Original proposal'})).toBeVisible();}
for(const mobile of [false,true])test(`review edit approve history and explicit authorship ${mobile?'mobile':'desktop'}`,async({page})=>{
 if(mobile)await page.setViewportSize({width:390,height:844});const fixture=await setup(page);
 await expect(page.getByText('Admin-edited before release · agent-authored')).toBeVisible();await open(page);
 await expect(page.getByText('Human source',{exact:true})).toBeVisible();await expect(page.getByText('Relevant delivered context')).toBeVisible();
 await page.getByLabel('Final message body').fill('Edited release');await page.getByRole('button',{name:'Approve with edits',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'approved_with_edits'})).toBeVisible();expect(fixture.posts()).toBe(1);
 await page.getByRole('button',{name:'History',exact:true}).click();await page.getByRole('button',{name:/Mira fixture.*Private destination/}).click();
 await expect(page.getByText('Released',{exact:true})).toBeVisible();await expect(page.getByText('Private note',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Close review queue',exact:true}).click();await expect(page.getByRole('button',{name:/^Review queue,/})).toBeFocused();
});
test('ordinary user never fetches or renders governance content',async({page})=>{
 let reads=0;await setup(page,false);page.on('request',r=>{if(r.url().includes('/admin/approvals'))reads++;});
 await expect(page.getByRole('button',{name:/^Review queue,/})).toHaveCount(0);await expect(page.getByText('Proposal one',{exact:true})).toHaveCount(0);expect(reads).toBe(0);
});
test('invalid final body recovers focus and rejection traps focus, cancels and restores',async({page})=>{
 await setup(page);await open(page);await page.getByLabel('Final message body').fill(' ');await page.getByRole('button',{name:'Approve with edits',exact:true}).click();
 await expect(page.getByLabel('Final message body')).toHaveAttribute('aria-invalid','true');await expect(page.getByLabel('Final message body')).toBeFocused();
 await page.getByLabel('Final message body').fill('Valid');await expect(page.getByLabel('Final message body')).not.toHaveAttribute('aria-invalid','true');
 await page.getByRole('button',{name:'Reject',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Reject proposal?'});
 await expect(dialog.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(dialog.getByRole('button',{name:'Confirm reject'})).toBeFocused();await page.keyboard.press('Tab');await expect(dialog.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'Reject',exact:true})).toBeFocused();
 await page.getByRole('button',{name:'Reject',exact:true}).click();await dialog.getByLabel('Reason (optional, private)').fill('Private');await dialog.getByRole('button',{name:'Confirm reject'}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole('status').filter({hasText:'rejected'})).toBeVisible();
});
test('duplicate submit is prevented and stale queue poll cannot resurrect a resolved draft',async({page})=>{
 await setup(page);await page.clock.install();await open(page);let old:Route|undefined,post:Route|undefined;let posts=0;
 await page.route('**/api/admin/approvals?status=pending*',route=>{old=route;});await page.clock.runFor(5000);await expect.poll(()=>!!old).toBe(true);
 await page.route('**/decision',route=>{post=route;posts++;});await page.getByRole('button',{name:'Approve unchanged',exact:true}).dblclick();await expect.poll(()=>!!post).toBe(true);expect(posts).toBe(1);
 await post!.fulfill({json:detail('one','approved').decision});await expect(page.getByRole('status').filter({hasText:'approved'})).toBeVisible();
 await old!.fulfill({json:{items:[{draft:draft(),agent,destination}],pendingCount:1,nextCursor:null}});await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));
 await expect(page.getByRole('button',{name:/Mira fixture.*Private destination/})).toHaveCount(0);
});
test('delayed old detail cannot replace a newer selection; mobile Back clears private context',async({page})=>{
 await page.setViewportSize({width:390,height:844});await setup(page);let held:Route|undefined;
 await page.route('**/api/admin/approvals?status=pending*',route=>route.fulfill({json:{items:['one','two'].map(id=>({draft:draft(id),agent,destination})),pendingCount:2,nextCursor:null}}));
 await page.route('**/api/admin/approvals/one',route=>{held=route;});await page.route('**/api/admin/approvals/two',route=>route.fulfill({json:detail('two')}));
 await page.getByRole('button',{name:/^Review queue,/}).click();await page.getByRole('button').filter({hasText:'Proposal one'}).click();await expect.poll(()=>!!held).toBe(true);
 await page.getByRole('button',{name:'Back to list'}).click();await expect(page.getByText('Human source',{exact:true})).toHaveCount(0);await page.getByRole('button').filter({hasText:'Proposal two'}).click();await expect(page.getByLabel('Final message body')).toHaveValue('Proposal two');
 await held!.fulfill({json:detail('one')});await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));await expect(page.getByLabel('Final message body')).toHaveValue('Proposal two');await expect(page.getByRole('region',{name:'Proposal detail'}).getByText('Proposal one',{exact:true})).toHaveCount(0);
});
test('terminal detail fences a stale pending poll and removes a concurrently resolved proposal',async({page})=>{
 await setup(page);await page.clock.install();await page.getByRole('button',{name:/^Review queue,/}).click();await expect(page.getByRole('button').filter({hasText:'Proposal one'})).toBeVisible();let held:Route|undefined;let gets=0;
 await page.route('**/api/admin/approvals?status=pending*',route=>++gets===1?(held=route,undefined):route.fulfill({json:{items:[],pendingCount:0,nextCursor:null}}));
 await page.clock.runFor(5000);await expect.poll(()=>!!held).toBe(true);await page.route('**/api/admin/approvals/one',route=>route.fulfill({json:detail('one','rejected')}));
 await page.getByRole('button').filter({hasText:'Proposal one'}).click();await expect(page.getByRole('heading',{name:'Outcome: rejected'})).toBeVisible();
 await held!.fulfill({json:{items:[{draft:draft(),agent,destination}],pendingCount:1,nextCursor:null}});await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));expect(await page.getByRole('button').filter({hasText:'Proposal one'}).count()).toBe(0);
});
test('stale history poll cannot overwrite pending view',async({page})=>{
 await setup(page);await page.clock.install();await open(page);await page.getByRole('button',{name:'History',exact:true}).click();let held:Route|undefined;
 await page.route('**/api/admin/approvals?status=resolved*',route=>{held=route;});await page.clock.runFor(5000);await expect.poll(()=>!!held).toBe(true);
 await page.getByRole('button',{name:'Pending',exact:true}).click();await expect(page.getByRole('button').filter({hasText:'Proposal one'})).toBeVisible();await held!.fulfill({json:{items:[{draft:{...draft('old'),state:'rejected'},agent,destination}],pendingCount:0,nextCursor:null}});
 await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));await expect(page.getByRole('button').filter({hasText:'Proposal one'})).toBeVisible();await expect(page.getByText('Proposal old',{exact:true})).toHaveCount(0);
});
test('409 displays authoritative terminal outcome and reconciles queue',async({page})=>{
 await setup(page);await open(page);
 await page.route('**/decision',route=>route.fulfill({status:409,json:{title:'Already resolved'}}));
 await page.route('**/api/admin/approvals/one',route=>route.fulfill({json:detail('one','rejected')}));
 await page.getByRole('button',{name:'Approve unchanged',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'rejected'})).toBeVisible();await expect(page.getByText('Private note',{exact:true})).toBeVisible();
});
test('pending rejection keeps focus in confirmation and blocks Escape and duplicate decisions',async({page})=>{
 await setup(page);await open(page);let held:Route|undefined;await page.route('**/decision',route=>{held=route;});
 await page.getByRole('button',{name:'Reject',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Reject proposal?'});await dialog.getByRole('button',{name:'Confirm reject'}).click();await expect.poll(()=>!!held).toBe(true);
 await expect(dialog).toBeFocused();await page.keyboard.press('Escape');await page.keyboard.press('Tab');await expect(dialog).toBeVisible();await expect(dialog).toBeFocused();
 await held!.fulfill({json:detail('one','rejected').decision});await expect(dialog).toHaveCount(0);await expect(page.getByRole('heading',{name:'Review queue',exact:true})).toBeFocused();
});
test('session expiry discards draft content and returns to sign in',async({page})=>{
 await setup(page);await open(page);await page.route('**/decision',route=>route.fulfill({status:401,json:{title:'Authentication required'}}));await page.getByRole('button',{name:'Approve unchanged',exact:true}).click();await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();await expect(page.getByText('Proposal one',{exact:true})).toHaveCount(0);
});

test('identity corrections distinguish duplicate agents destinations recipients and context',async({page})=>{
 await setup(page);
 const a1='11111111-1111-4111-8111-111111111111',a2='11111111-1111-4111-8111-111111111112';
 const c1='22222222222242228222222222222221',c2='22222222222242228222222222222222';
 const p1='33333333-3333-4333-8333-333333333331',p2='33333333-3333-4333-8333-333333333332';
 const h1='44444444-4444-4444-8444-444444444441',h2='44444444-4444-4444-8444-444444444442';
 const first={draft:{...draft(p1),authorId:a1,conversationId:c1,body:'Similar proposal'},agent:{...agent,id:a1},destination:{...destination,id:c1}};
 const second={draft:{...draft(p2),authorId:a2,conversationId:c2,body:'Similar proposal'},agent:{...agent,id:a2},destination:{...destination,id:c2}};
 await page.route('**/api/admin/approvals?status=pending*',r=>r.fulfill({json:{items:[first,second],pendingCount:2,nextCursor:null}}));
 await page.route(`**/api/admin/approvals/${p2}`,r=>r.fulfill({json:{...detail(p2),...second,recipients:[{...human,id:h1,name:'Same'},{...human,id:h2,name:'Same'},second.agent],sourceMessage:{id:'source',authorId:h2,createdAt:'2026-01-01T01:00:00Z',body:'Human source'},context:[{id:'context',authorId:h1,createdAt:'2026-01-01T02:00:00Z',body:'Relevant delivered context'}]}}));
 let sent='';await page.route('**/decision',r=>{sent=new URL(r.request().url()).pathname;return r.fulfill({json:detail(p2,'approved').decision});});
 await page.getByRole('button',{name:/^Review queue,/}).click();
 await page.getByRole('button',{name:new RegExp(`${a2}.*${c2}.*${p2}`)}).click();
 await expect(page.getByRole('heading',{name:new RegExp(`${a2}.*${c2}.*${p2}`)})).toBeVisible();
 const region=page.getByRole('region',{name:'Proposal detail'});
 await expect(region.getByText(new RegExp(`Recipients:.*Same.*${h1}.*Same.*${h2}`))).toBeVisible();
 await expect(region.locator('time[datetime="2026-01-01T01:00:00Z"]')).toBeVisible();
 await expect(region.getByText(new RegExp(`Same.*${h2}`)).last()).toBeVisible();
 await expect(region.locator('time[datetime="2026-01-01T02:00:00Z"]')).toBeVisible();
 await page.getByRole('button',{name:'Approve unchanged',exact:true}).click();await expect.poll(()=>sent).toBe(`/api/admin/approvals/${p2}/decision`);
});
for(const view of ['pending','resolved'])test(`pagination corrections preserve loaded ${view} pages selection and reconcile first page`,async({page})=>{
 await setup(page);await page.clock.install();let polls=0;
 const item=(id:string)=>({draft:{...draft(id),state:view==='pending'?'pending':'rejected'},agent,destination});
 const firstExtras=Array.from({length:24},(_,i)=>item(`first-${i}`));const laterExtras=Array.from({length:23},(_,i)=>item(`later-${i}`));
 await page.route(`**/api/admin/approvals?status=${view}*`,r=>{const after=new URL(r.request().url()).searchParams.has('after');return r.fulfill({json:{items:after?[item('two'),item('three'),...laterExtras]:++polls===1?[item('one'),...firstExtras]:[item('replacement'),item('two'),...firstExtras.slice(1)],pendingCount:3,nextCursor:after?null:'cursor'}});});
 await page.route('**/api/admin/approvals/three',r=>r.fulfill({json:detail('three',view==='pending'?'pending':'rejected')}));
 await page.getByRole('button',{name:/^Review queue,/}).click();if(view==='resolved')await page.getByRole('button',{name:'History',exact:true}).click();
 await page.getByRole('button',{name:'Load more'}).click();await page.getByRole('button').filter({hasText:'Proposal three'}).click();
 await expect(page.getByRole('heading',{name:'Original proposal'})).toBeVisible();
 for(let i=0;i<3;i++){await page.clock.runFor(5000);await expect(page.getByRole('button').filter({hasText:'Proposal three'})).toHaveCount(1);}
 await expect(page.getByRole('button').filter({hasText:'Proposal one'})).toHaveCount(0);await expect(page.getByRole('button').filter({hasText:'Proposal two'})).toHaveCount(1);
 await expect(page.getByRole('button').filter({hasText:'Proposal three'})).toHaveAttribute('aria-current','true');
 if(view==='pending'){
  await page.getByRole('button',{name:'Approve unchanged',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'approved'})).toBeVisible();
  await expect(page.getByRole('button').filter({hasText:'Proposal three'})).toHaveCount(0);
  await page.clock.runFor(5000);await expect(page.getByRole('button').filter({hasText:'Proposal later-0'})).toBeVisible();
  await expect(page.getByRole('button').filter({hasText:'Proposal two'})).toHaveCount(1);
 }
 await page.getByRole('button',{name:view==='pending'?'History':'Pending',exact:true}).click();await expect(page.getByRole('button').filter({hasText:'Proposal three'})).toHaveCount(0);
});
test('detail correction retries selected proposal independently of queue refresh',async({page})=>{
 await setup(page);let reads=0;await page.route('**/api/admin/approvals/one',r=>++reads===1?r.fulfill({status:500,json:{title:'Detail unavailable'}}):r.fulfill({json:detail()}));
 await page.getByRole('button',{name:/^Review queue,/}).click();await page.getByRole('button').filter({hasText:'Proposal one'}).click();
 await expect(page.getByRole('alert').filter({hasText:/proposal detail/i})).toBeVisible();await expect(page.getByText('Loading proposal…',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Retry proposal detail'}).click();await expect(page.getByLabel('Final message body')).toHaveValue('Proposal one');expect(reads).toBe(2);
});
test('context correction includes scoped author identity and semantic timestamps',async({page})=>{
 await setup(page);await open(page);const region=page.getByRole('region',{name:'Proposal detail'});
 await expect(region.locator('time[datetime="2026-01-01T01:00:00Z"]')).toBeVisible();
 await expect(region.locator('time[datetime="2026-01-01T02:00:00Z"]')).toBeVisible();
 await expect(region.getByText('Admin [human] ·',{exact:false})).toBeVisible();
 await expect(region.getByText('Mira fixture [agent] ·',{exact:false})).toBeVisible();
});
test('count correction announces pending and caught up accessibly',async({page})=>{
 await setup(page);await expect(page.getByRole('button',{name:'Review queue, 1 pending approval',exact:true})).toBeVisible();
 await page.getByRole('button',{name:/^Review queue,/}).click();await page.getByRole('button').filter({hasText:'Proposal one'}).click();await page.getByRole('button',{name:'Approve unchanged',exact:true}).click();
 await page.getByRole('button',{name:'Close review queue',exact:true}).click();await expect(page.getByRole('button',{name:'Review queue, all caught up',exact:true})).toBeVisible();
});
test('unchanged reviewed agent output has truthful ordinary marker',async({page})=>{
 await setup(page);await page.route('**/api/workspace/home',r=>r.fulfill({json:{participants:[human,agent],conversation:{...destination,id:'main',title:'Main',kind:'main'},conversations:[],messages:[{id:'unchanged',authorId:'agent',body:'Unchanged release',createdAt:'2026-01-01T00:00:00Z',approvedThroughReview:true,editedBeforeRelease:false}]}}));await page.reload();
 await expect(page.getByText('Approved through review · agent-authored',{exact:true})).toBeVisible();await expect(page.getByText('Admin-edited before release · agent-authored',{exact:true})).toHaveCount(0);
});
