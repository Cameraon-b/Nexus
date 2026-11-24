import {test,expect,Page} from '@playwright/test';
const people=[{id:'self',name:'Alice',kind:'human',state:'active'},{id:'human-111111',name:'Sam',kind:'human',state:'active'},{id:'human-222222',name:'Sam',kind:'human',state:'active'},{id:'other',name:'Unrelated',kind:'human',state:'active'}];
const main={id:'main',title:'The Common Room',kind:'main',state:'active',participantIds:people.map(p=>p.id)};
const dm={id:'dm',title:'Sam',kind:'direct',state:'active',participantIds:['self',people[1].id]};
const dm2={...dm,id:'dm2',participantIds:['self',people[2].id]};
async function setup(page:Page,{home,history,post,duplicates=false,directory=people}:{directory?:typeof people;home:()=>Promise<any>|any;history?:()=>number;post?:(body:any)=>any;duplicates?:boolean}){
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/status'))return route.fulfill({json:{requiresBootstrap:false,registrationAvailable:false}});
  if(path.endsWith('/me'))return route.fulfill({json:{id:'account',participantId:'self',displayName:'Alice',email:'a@example.test',isAdmin:true}});
  if(path.endsWith('/csrf'))return route.fulfill({json:{token:'test'}});
  if(path.endsWith('/home'))return route.fulfill({json:{participants:duplicates?directory:directory.filter(p=>p.id!==people[2].id),conversation:main,messages:[],conversations:await home()}});
  if(route.request().method()==='POST')return route.fulfill({json:await post?.(route.request().postDataJSON())??dm});
  const status=history?.()??200;
  return route.fulfill(status===200?{json:[{id:'secret',conversationId:'dm',authorId:'self',body:'Private cached text',createdAt:'2026-01-01T00:00:00Z',state:'delivered'}]}:{status,json:{title:'Denied'}});
 });
 await page.goto('/');
}
async function open(page:Page,name='Sam'){
 await page.getByRole('button',{name:'Direct messages',exact:true}).click();
 await page.getByRole('button',{name,exact:true}).click();
}
test('successful home omission purges selected private messages and drafts',async({page})=>{
 let omit=false;
 await setup(page,{home:()=>omit?[main]:[main,dm]});await open(page);
 await expect(page.getByRole('log')).toContainText('Private cached text');await page.locator('#live-message').fill('private draft');omit=true;
 await expect(page.getByRole('heading',{name:main.title,exact:true})).toBeVisible({timeout:8000});
 await expect(page.getByText('Private cached text')).toHaveCount(0);await expect(page.getByRole('button',{name:'Sam',exact:true})).toHaveCount(0);
 omit=false;await expect(page.getByRole('button',{name:'Sam',exact:true})).toBeVisible({timeout:8000});await page.getByRole('button',{name:'Sam',exact:true}).click();await expect(page.locator('#live-message')).toHaveValue('');
});
for(const status of [403,404])test(`selected DM history ${status} purges and selects Main`,async({page})=>{
 let denied=false;await setup(page,{home:()=>[main,dm],history:()=>denied?status:200});await open(page);
 await expect(page.getByRole('log')).toContainText('Private cached text');denied=true;
 await expect(page.getByRole('heading',{name:main.title,exact:true})).toBeVisible({timeout:8000});await expect(page.getByText('Private cached text')).toHaveCount(0);await expect(page.getByRole('button',{name:'Sam',exact:true})).toHaveCount(0);
});
for(const kind of ['direct','topical'])test(`stale pre-create poll cannot erase successful ${kind} creation, later omission can`,async({page})=>{
 let reads=0;let release!:(items:any[])=>void;
 const stale=new Promise<any[]>(resolve=>{release=resolve;});let observed=false;
 const created=kind==='direct'?dm:{...dm,id:'topic',kind:'topical',title:'New topic'};
 await setup(page,{home:()=>++reads===2?stale:observed?[main,created]:[main],post:()=>kind==='direct'?created:{conversation:created,openingMessage:{id:'opening',conversationId:created.id,authorId:'self',body:'Opening',createdAt:'2026-01-01T00:00:00Z'}}});
 await expect.poll(()=>reads,{timeout:8000}).toBe(2);
 await page.getByRole('button',{name:kind==='direct'?'Direct messages':'Topics',exact:true}).click();await page.getByRole('button',{name:kind==='direct'?'New message':'New topic',exact:true}).click();
 if(kind==='direct'){await page.getByLabel('Recipient').selectOption(people[1].id);await page.getByRole('button',{name:'Open conversation',exact:true}).click();}
 else{await page.getByLabel('Topic title').fill('New topic');await page.getByLabel('Opening message').fill('Opening');await page.getByRole('button',{name:'Create topic',exact:true}).click();}
 await expect(page.getByRole('heading',{name:created.title,exact:true,level:1})).toBeVisible();release([main]);await expect.poll(()=>reads).toBeGreaterThanOrEqual(2);await page.waitForTimeout(300);
 await expect(page.getByRole('heading',{name:created.title,exact:true,level:1})).toBeVisible();
 observed=true;await expect.poll(()=>reads,{timeout:8000}).toBeGreaterThanOrEqual(3);observed=false;
 await expect(page.getByRole('heading',{name:main.title,exact:true})).toBeVisible({timeout:8000});
});
for(const status of [403,404])test(`send ${status} purges private cache without retry`,async({page})=>{
 await setup(page,{home:()=>[main,dm]});await open(page);
 await expect(page.getByRole('log')).toContainText('Private cached text');
 await page.locator('#live-message').fill('denied private draft');
 await page.route('**/api/conversations/dm/messages',async route=>{
  if(route.request().method()==='POST')return route.fulfill({status,json:{title:'Denied'}});
  return route.fallback();
 });
 await page.getByRole('button',{name:'Send',exact:true}).click();
 await expect(page.getByRole('heading',{name:main.title,exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Sam',exact:true})).toHaveCount(0);
 await expect(page.getByText('Private cached text')).toHaveCount(0);
 await expect(page.locator('#live-message')).toHaveValue('');
 await expect(page.getByText(/Delivery not confirmed/)).toHaveCount(0);
});

test('first fresh post-create omission purges an unobserved local DM',async({page})=>{
 let restore=false;
 await setup(page,{home:()=>restore?[main,dm]:[main]});
 await page.getByRole('button',{name:'Direct messages',exact:true}).click();
 await page.getByRole('button',{name:'New message',exact:true}).click();
 await page.getByLabel('Recipient').selectOption(people[1].id);
 await page.getByRole('button',{name:'Open conversation',exact:true}).click();
 await expect(page.getByRole('log')).toContainText('Private cached text');
 await page.locator('#live-message').fill('unobserved private draft');
 await expect(page.getByRole('heading',{name:main.title,exact:true})).toBeVisible({timeout:8000});
 await expect(page.getByRole('button',{name:'Sam',exact:true})).toHaveCount(0);
 await expect(page.getByText('Private cached text')).toHaveCount(0);
 await expect(page.locator('#live-message')).toHaveValue('');
 await page.route('**/api/conversations/dm/messages',route=>route.fulfill({json:[]}));
 restore=true;
 await expect(page.getByRole('button',{name:'Sam',exact:true})).toBeVisible({timeout:8000});
 await page.getByRole('button',{name:'Sam',exact:true}).click();
 await expect(page.locator('#live-message')).toHaveValue('');
 await expect(page.getByRole('log')).not.toContainText('Private cached text');
});

test('home started before history denial cannot resurrect DM; later inclusion restores clean lifetime',async({page})=>{
 let reads=0,denied=false;
 let release!:(items:any[])=>void;
 const stale=new Promise<any[]>(resolve=>{release=resolve;});
 await setup(page,{home:()=>++reads===2?stale:[main,dm],history:()=>denied?403:200});
 await open(page);await expect(page.getByRole('log')).toContainText('Private cached text');
 await page.locator('#live-message').fill('revoked private draft');
 await page.getByRole('button',{name:'Common room',exact:true}).click();
 await expect.poll(()=>reads,{timeout:8000}).toBe(2);
 denied=true;await page.getByRole('button',{name:'Sam',exact:true}).click();
 await expect(page.getByRole('heading',{name:main.title,exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Sam',exact:true})).toHaveCount(0);
 release([main,dm]);await page.waitForTimeout(300);
 await expect(page.getByRole('button',{name:'Sam',exact:true})).toHaveCount(0);
 await expect(page.getByText('Private cached text')).toHaveCount(0);
 await page.route('**/api/conversations/dm/messages',route=>route.fulfill({json:[]}));
 await expect(page.getByRole('button',{name:'Sam',exact:true})).toBeVisible({timeout:8000});
 await page.getByRole('button',{name:'Sam',exact:true}).click();
 await expect(page.locator('#live-message')).toHaveValue('');
 await expect(page.getByRole('log')).not.toContainText('Private cached text');
});

test('a send completed after purge and rediscovery cannot restore a revoked conversation cache',async({page})=>{
 let omit=false;let release!:(message:any)=>void;
 const pending=new Promise(resolve=>{release=resolve;});
 await setup(page,{home:()=>omit?[main]:[main,dm],post:()=>pending});await open(page);
 await page.locator('#live-message').fill('Late private delivery');await page.getByRole('button',{name:'Send',exact:true}).click();omit=true;
 await expect(page.getByRole('heading',{name:main.title,exact:true})).toBeVisible({timeout:8000});omit=false;
 await expect(page.getByRole('button',{name:'Sam',exact:true})).toBeVisible({timeout:8000});await page.getByRole('button',{name:'Sam',exact:true}).click();
 release({id:'late',conversationId:'dm',authorId:'self',body:'Late private delivery',createdAt:'2026-01-02T00:00:00Z',state:'delivered'});
 await page.waitForTimeout(300);await expect(page.getByRole('log')).not.toContainText('Late private delivery');await expect(page.locator('#live-message')).toHaveValue('');
});

test('duplicate names are disambiguated consistently and picker posts the intended ID',async({page})=>{
 let target='';await setup(page,{duplicates:true,home:()=>[main,dm,dm2],post:body=>{target=body.participantId;return dm2;}});
 await page.getByRole('button',{name:'Direct messages',exact:true}).click();
 await expect(page.getByRole('button',{name:'Sam (111111)',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Sam (222222)',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'New message',exact:true}).click();
 await expect(page.getByLabel('Recipient').locator('option')).toHaveText(['Choose a person','Sam (111111)','Sam (222222)','Unrelated']);
 await page.getByLabel('Recipient').selectOption({label:'Sam (222222)'});await page.getByRole('button',{name:'Open conversation',exact:true}).click();await expect.poll(()=>target).toBe(people[2].id);
 await expect(page.getByRole('heading',{name:'Sam (222222)',exact:true,level:1})).toBeVisible();await expect(page.getByLabel('Message Sam (222222)',{exact:true})).toBeFocused();await expect(page.getByRole('log',{name:'Sam (222222) messages'})).toBeVisible();
});
test('duplicate names with colliding short UUID suffixes still have distinct private labels',async({page})=>{
 const directory=people.map((person,index)=>index===1?{...person,id:'one1abcdef'}:index===2?{...person,id:'two2abcdef'}:person);
 await setup(page,{duplicates:true,directory,home:()=>[main,{...dm,participantIds:['self','one1abcdef']},{...dm2,participantIds:['self','two2abcdef']}]});
 await page.getByRole('button',{name:'Direct messages',exact:true}).click();
 await expect(page.getByRole('button',{name:'Sam (1abcdef)',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Sam (2abcdef)',exact:true})).toBeVisible();
});

test('375px DM participant context is exactly the pair and new message dialog fits',async({page})=>{
 await page.setViewportSize({width:375,height:812});await setup(page,{home:()=>[main,dm]});await open(page);
 await expect(page.locator('.live-mobile-people')).toHaveText('Participants: Alice, Sam');await expect(page.locator('.live-mobile-people')).not.toContainText('Unrelated');
 await page.getByRole('button',{name:'New message',exact:true}).click();await expect(page.getByLabel('Recipient')).toBeVisible();
 for(const control of [page.getByLabel('Recipient'),page.getByRole('button',{name:'Close new message'}),page.getByRole('button',{name:'Open conversation',exact:true})]){const box=await control.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.width).toBeGreaterThanOrEqual(44);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
