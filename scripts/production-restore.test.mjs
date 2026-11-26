import {test} from 'node:test';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {validateRestoreConfig,restoreStack,auditRestoreCompose} from './production-restore.mjs';
import {mkdtempSync,mkdirSync,rmSync,readFileSync,existsSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fakeRestore,project,keys,metadata} from './fixtures/restore-runner.mjs';
import {aggregates} from './fixtures/recovery.mjs';
export const restoreConfig={identity:'/private/identity',tempRoot:'/private/temp',sourceProject:'nexus_prod_example',host:'localhost',bindIp:'127.0.0.1',port:49991,backendSubnet:'10.251.10.0/24',backendDynamicRange:'10.251.10.128/25',frontendIp:'10.251.10.2',edgeSubnet:'10.251.11.0/24',edgeDynamicRange:'10.251.11.128/25',edgeProxy:'10.251.11.2'};
test('restore closed config validates private nested isolated ranges and loopback publication',()=>{
 assert.deepEqual(validateRestoreConfig({...restoreConfig}),restoreConfig);
 for(const change of [{extra:true},{host:'example.com'},{bindIp:'0.0.0.0'},{bindIp:'192.168.0.1'},{port:0},{port:65536},{port:1.5},{backendSubnet:'8.8.8.0/24'},{backendSubnet:'10.251.10.1/24'},{backendDynamicRange:'10.252.0.0/24'},{frontendIp:'10.251.10.129'},{frontendIp:'10.251.10.0'},{edgeSubnet:'10.251.10.0/24'},{edgeProxy:'8.8.8.8'},{identity:'relative'},{sourceProject:'nexus_prod_*'},{sourceProject:'nexus_prod_example\n'}])assert.throws(()=>validateRestoreConfig({...restoreConfig,...change}));
 assert.throws(()=>validateRestoreConfig(restoreConfig,['10.0.0.0/8']));
 assert.throws(()=>validateRestoreConfig(restoreConfig,['invalid']));
 fixture(o=>{let called=false;assert.throws(()=>restoreStack({...o,project:project+'\n',run:()=>{called=true;throw Error('must not run');}}));assert.equal(called,false);});

});
function fixture(fn){const dir=mkdtempSync(join(tmpdir(),'nexus_restore_unit_'));try{const root=join(dir,'repo'),stage=join(dir,'stage');mkdirSync(root);mkdirSync(stage);const config={...restoreConfig};return fn({root,stage,config,project,metadata,files:{'includes/database-password':Buffer.from('fake-private-password'),'database.dump':Buffer.from('PGDMPfake'),'keys.tar':keys}});}finally{rmSync(dir,{recursive:true,force:true});}}
const stack=(o,mutate)=>{const f=fakeRestore({...o,mutate});return {...f,go:()=>restoreStack({...o,run:f.run})};};
test('exact restore command order, stdin archives, private generated env, migration/runtime/status/aggregate and key checks',()=>fixture(o=>{
 const f=stack(o);f.go();
 if(process.platform!=='win32'){assert.equal(statSync(join(o.stage,'database-password')).mode&0o777,0o444);assert.equal(statSync(join(o.stage,'production.env')).mode&0o777,0o600);}
 assert.ok(f.calls.some(c=>c.args.at(-1).includes('chmod 0600 /keys/key-*.xml')));
 const cmds=f.calls.map(c=>c.args.join(' '));
 const at=s=>cmds.findIndex(c=>c.includes(s));
 const sequence=['container ls --all','image inspect','config --format','up --detach','pg_class','pg_restore --exit-on-error','volume create','tar -xf','tar -cf','--exit-code-from migrate','up --detach --no-deps','json_build_object','await readRestoreStatus','down --volumes --remove-orphans'];
 for(let i=1;i<sequence.length;i++)assert.ok(at(sequence[i-1])<at(sequence[i]),sequence[i]);
 assert.equal(cmds.filter(c=>c.includes('tar -cf')).length,2);
 for(const c of f.calls.filter(c=>c.args[0]==='run')){assert.equal(c.args[c.args.indexOf('--user')+1],c.options.input?'0':'1654:1654');assert.equal(c.args[c.args.indexOf('--entrypoint')+2+(c.options.input?1:0)],metadata.imageIds.postgres);assert.ok(c.args.includes('--pull'));}
 const restore=f.calls.find(c=>c.args.includes('pg_restore'));assert.deepEqual(restore.options.input,o.files['database.dump']);
 assert.deepEqual(f.calls.find(c=>c.args.at(-1).startsWith('tar -xf')).options.input,keys);
 const env=readFileSync(join(o.stage,'production.env'),'utf8');assert.ok(env.includes("NEXUS_HOST='localhost'"));assert.ok(env.includes(join(o.stage,'database-password').replaceAll('\\','/')));assert.ok(!env.includes('fake-private-password'));
 assert.equal(readFileSync(join(o.stage,'database-password'),'utf8'),'fake-private-password');
 for(const c of f.calls){assert.ok(Array.isArray(c.args));assert.ok(!c.args.join(' ').includes('fake-private'));if(c.exe==='docker'&&c.args[0]==='compose')assert.equal(c.args[c.args.indexOf('--env-file')+1],join(o.stage,'production.env'));}
 assert.equal(f.calls.filter(c=>c.down&&c.args[1]==='ls').length,6);
}));
test('blocker: every restore startup is bound to signed IDs despite substituted tags',()=>fixture(o=>{
 const tags=new Map(Object.entries(metadata.images).map(([s,tag])=>[tag,metadata.imageIds[s]]));const substituted='sha256:'+'f'.repeat(64);let startups=0;
 const f=stack(o,(r,c)=>{
  if(c.args.includes('config')){const v=JSON.parse(r);assert.deepEqual(Object.fromEntries(Object.entries(v.services).map(([s,v])=>[s,v.image])),{postgres:metadata.imageIds.postgres,migrate:metadata.imageIds.api,api:metadata.imageIds.api,frontend:metadata.imageIds.frontend});}
  if(c.exe!== 'docker')for(const tag of tags.keys())tags.set(tag,substituted); // concurrent retag after preflight, before first up
  if(c.args.includes('up')){startups++;assert.ok([...tags.values()].every(id=>id===substituted));const override=JSON.parse(readFileSync(c.args[c.args.lastIndexOf('-f')+1]));for(const [s,v] of Object.entries(override.services)){const startedId=tags.get(v.image)??v.image;assert.equal(startedId,metadata.imageIds[s==='migrate'?'api':s]);assert.notEqual(startedId,substituted);}}
  if(c.args[0]==='image')assert.ok(Object.values(metadata.imageIds).includes(c.args.at(-1)),'must inspect IDs, not substitutable tags');
  return r;
 });f.go();assert.equal(startups,3);
}));
test('live restore status command preserves reviewed Host and rejects redirects and wrong content types',async()=>{
 let command;
 fixture(o=>{const f=stack(o);f.go();command=f.calls.find(c=>c.exe===process.execPath&&c.args.at(-2).endsWith('/api/auth/status'));});
 const body=JSON.stringify({requiresBootstrap:false,registrationAvailable:false});
 let mode='ok',hits=0;
 const server=createServer((req,res)=>{hits++;if(req.headers.host!=='localhost'){res.writeHead(400).end();return;}res.writeHead(mode==='redirect'?302:200,{'content-type':mode==='html'?'text/html':'application/json',location:'/api/auth/status'}).end(body);});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  const args=[...command.args];args[args.length-2]=`http://127.0.0.1:${server.address().port}/api/auth/status`;
  const run=()=>promisify(execFile)(command.exe,args,{timeout:10000});
  assert.equal((await run()).stdout,body);
  for(mode of ['redirect','html'])await assert.rejects(run);
  assert.equal(hits,3);
 }finally{server.close();await once(server,'close');}
});
test('restored zero accounts requires bootstrap while registration remains closed',()=>fixture(o=>{
 o.metadata={...o.metadata,aggregates:{...aggregates,accounts:0}};
 const f=stack(o,(r,c)=>{
  if(c.args.at(-1).includes('json_build_object'))return JSON.stringify(o.metadata.aggregates);
  if(c.exe!=='docker'&&c.args.at(-1)==='localhost'&&!c.args.some(a=>a.includes('await verifyFrontend')))return JSON.stringify({requiresBootstrap:true,registrationAvailable:false});
  return r;
 });f.go();assert.ok(f.calls.some(c=>c.args.includes('down')));
}));
test('review: restored Memberships/InboxCursors mismatch or frontend proof failure refuses and tears down',()=>{
 for(const key of ['memberships','inboxCursors','frontend'])fixture(o=>{const f=stack(o,(r,c)=>{if(key==='frontend'&&c.args.some(a=>a.includes('await verifyFrontend')))return 'broken frontend';if(key!=='frontend'&&c.args.at(-1).includes('json_build_object'))return JSON.stringify({...aggregates,[key]:aggregates[key]+1});return r;});assert.throws(f.go);assert.ok(f.calls.some(c=>c.args.includes('down')));});
});
test('preexisting container/network/volume, local image mismatch, network overlap and occupied port refuse before resource creation',()=>{
 for(const defect of ['container','network','volume','named-container','named-network','named-volume','image','overlap','port'])fixture(o=>{
  const f=stack(o,(result,c)=>{
   if(defect===c.args[0]&&c.args[1]==='ls'&&c.args.some(a=>a.startsWith('label=')))return 'existing';
   if(defect==='named-'+c.args[0]&&c.args[1]==='ls'&&c.args.some(a=>a.startsWith('name=')))return 'existing-unlabeled-or-foreign';
   if(defect==='image'&&c.args[0]==='image')return JSON.stringify([{Id:'sha256:'+'0'.repeat(64)}]);
   if(defect==='overlap'&&c.args[0]==='network'&&c.args[1]==='ls'&&!c.args.includes('--filter'))return 'existing-network';
   if(defect==='overlap'&&c.args[0]==='network'&&c.args[1]==='inspect')return JSON.stringify([{IPAM:{Config:[{Subnet:'10.0.0.0/8'}]}}]);
   if(defect==='port'&&c.exe!=='docker')throw Error('private stderr');return result;
  });
  assert.throws(f.go,e=>!e.message.includes('private stderr'));assert.ok(!f.calls.some(c=>c.args.includes('up')||c.args.includes('down')||c.args[0]==='run'));
 });
});
test('nonempty DB refuses before pg_restore; key mismatch refuses before migration/API; failed migration refuses API',()=>{
 for(const defect of ['nonempty','keys','migration'])fixture(o=>{
  const f=stack(o,(result,c)=>{
   if(defect==='nonempty'&&c.args.at(-1).includes('pg_class'))return '1';
   if(defect==='keys'&&c.args.at(-1).startsWith('tar -cf'))return Buffer.alloc(1024);
   if(defect==='migration'&&c.args[0]==='inspect'){const all=JSON.parse(result);for(const x of all)if(x.Config.Labels['com.docker.compose.service']==='migrate')x.State.ExitCode=1;return JSON.stringify(all);}
   return result;
  });
  assert.throws(f.go);assert.ok(f.calls.some(c=>c.args.includes('down')));assert.ok(!f.calls.some(c=>c.args.includes('--no-deps')&&c.args.at(-1)==='frontend'));
  if(defect==='nonempty')assert.ok(!f.calls.some(c=>c.args.includes('pg_restore')));
  if(defect==='keys')assert.ok(!f.calls.some(c=>c.args.includes('--exit-code-from')));
 });
});
test('every command failure after first Docker mutation attempts exact teardown and hides external diagnostics',()=>{
 let n;fixture(o=>{const f=stack(o);f.go();n=f.calls.findIndex(c=>c.args.includes('down'));});
 for(let index=0;index<n;index++)fixture(o=>{
  const f=stack(o,(r,c)=>{if(c.index===index)throw Error('decrypted-path identity-path fake-private-password certificate external-stderr');return r;});
  assert.throws(f.go,e=>!e.message.includes('external-stderr')&&!e.message.includes(o.stage));
  const first=f.calls.findIndex(c=>c.args.includes('up'));
  assert.equal(f.calls.some(c=>c.args.includes('down')),first>=0);
  for(const c of f.calls.filter(c=>c.args.includes('down'))){assert.deepEqual(c.args.slice(-3),['down','--volumes','--remove-orphans']);assert.equal(c.args[c.args.indexOf('--project-name')+1],project);}
 });
});
test('leftover stopped container/network/volume or failed down returns dedicated safe recovery code',()=>{
 for(const kind of ['container','network','volume','named-container','named-network','named-volume','down'])fixture(o=>{
  const f=stack(o,(r,c)=>{if(c.down&&c.args[0]===kind.replace('named-','')&&c.args[1]==='ls'&&c.args.some(a=>a.startsWith(kind.startsWith('named-')?'name=':'label=')))return 'leftover';if(kind==='down'&&c.args.includes('down'))throw Error('external-stderr');return r;});
  assert.throws(f.go,e=>e.code==='NEXUS_RESTORE_CLEANUP'&&e.message.includes(project)&&!e.message.includes(o.stage)&&!e.message.includes('external-stderr'));
  assert.ok(existsSync(join(o.stage,'production.env')));assert.ok(existsSync(join(o.stage,'database-password')));
 });
});
test('closed compose and runtime audits reject unexpected exposure, mounts/options, image, labels, state and restored checks',()=>{
 for(const defect of ['compose-extra','compose-bind','compose-port','runtime-revision','runtime-capabilities','runtime-user','runtime-root','runtime-security','runtime-bind','runtime-port','runtime-network','runtime-image','runtime-label','runtime-health','aggregate','migration-count','status-bootstrap','status-registration','final-keys'])fixture(o=>{
  let fingerprints=0;
  const f=stack(o,(r,c)=>{
   if(c.args.includes('config')&&defect.startsWith('compose-')){const v=JSON.parse(r);if(defect==='compose-extra')v.services.api.privileged=true;if(defect==='compose-bind')v.services.api.volumes.push({type:'bind',source:'/private',target:'/escape'});if(defect==='compose-port')v.services.frontend.ports[0].host_ip='0.0.0.0';return JSON.stringify(v);}
   if(c.args[0]==='inspect'&&defect.startsWith('runtime-')){const v=JSON.parse(r);if(v.length===4){const api=v.find(x=>x.Config.Labels['com.docker.compose.service']==='api');if(defect==='runtime-revision')api.Config.Labels['org.opencontainers.image.revision']='wrong';if(defect==='runtime-capabilities')api.HostConfig.CapAdd=['SYS_ADMIN'];if(defect==='runtime-user')api.Config.User='root';if(defect==='runtime-root')api.HostConfig.ReadonlyRootfs=false;if(defect==='runtime-security')api.HostConfig.SecurityOpt=[];if(defect==='runtime-bind')api.Mounts[0].RW=true;if(defect==='runtime-port')api.HostConfig.PortBindings={'8080/tcp':[{}]};if(defect==='runtime-network')api.NetworkSettings.Networks.public={};if(defect==='runtime-image')api.Image='sha256:'+'0'.repeat(64);if(defect==='runtime-label')api.Config.Labels['com.docker.compose.project']='nexus_prod_other';if(defect==='runtime-health')api.State.Health.Status='unhealthy';}return JSON.stringify(v);}
   if(c.args.at(-1).includes('json_build_object')&&['aggregate','migration-count'].includes(defect))return JSON.stringify({...aggregates,[defect==='aggregate'?'messages':'migrations']:100});
   if(c.exe!=='docker'&&c.args.at(-1)==='localhost'&&defect.startsWith('status-'))return JSON.stringify({requiresBootstrap:defect==='status-bootstrap',registrationAvailable:defect==='status-registration'});
   if(defect==='final-keys'&&c.args.at(-1).startsWith('tar -cf')&&++fingerprints===2)return Buffer.alloc(1024);
   return r;
  });assert.throws(f.go,e=>!e.message.includes(o.stage));
 });
});
