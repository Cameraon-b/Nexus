import {test} from 'node:test';
import {sealCandidate,privateCustody,relaxFixture,operationCandidate,removeFixture as rmSync} from './fixtures/operation-candidate.mjs';
import {spawnSync,spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,copyFileSync,linkSync,unlinkSync,existsSync,createReadStream,truncateSync,renameSync,lstatSync} from 'node:fs';
import {tmpdir,homedir} from 'node:os';
import {join,basename,dirname} from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {listBounded,listingByteCap,transferBounded,selectRetention,pullBackups as productionPullBackups,parsePullOptions,pushFromPrivateConfig} from './pull-production-backup.mjs';
import {verifyEnvelope,artifactNames,quartetLimits} from './production-envelope.mjs';
import {hash} from './production-recovery.mjs';
import {bindCandidate} from './production-candidate-binding.mjs';
for(const boundary of ['ssh','retention','notification'])for(const fault of ['drift','death'])test('round14 pull native '+fault+' before '+boundary+' preserves evidence and never succeeds',()=>fixture(async f=>{
 privateCustody(f.d);const seed=join(f.d,'tools/candidates/seed');mkdirSync(seed,{recursive:true});writeFileSync(join(seed,'reviewed'),'exact');const candidate=sealCandidate(seed),candidateBinding=bindCandidate(candidate);
 f.options.project='nexus_prod_'+hash(f.d);
 for(const date of boundary==='retention'?['2025-10-31T00:00:00Z','2025-11-01T00:00:00Z','2025-11-30T00:00:00Z','2025-12-31T00:00:00Z','2026-01-01T00:00:00Z','2026-01-02T00:00:00Z']:['2026-01-02T00:00:00Z'])trio(f.destination,date,f.options.project);trio(f.remote,'2026-01-02T00:00:00Z',f.options.project);
 const before=readdirSync(f.destination).sort();let notifications=0,hit=false;
 await assert.rejects(pullBackups({...f.options,root:candidate,candidateBinding,run:f.run,notify:()=>notifications++,beforeBoundary:async(name,custody)=>{
  if(name!==boundary||hit)return;hit=true;
  if(fault==='drift')relaxFixture(candidate);
  else{process.kill(custody.helperPid);await new Promise(r=>setTimeout(r,100));}
 }}),e=>e instanceof AggregateError&&e.errors.length===2&&(e.errors[1].code==='NEXUS_OPERATION_LOCK_CLEANUP'||e.errors[1] instanceof AggregateError));
 assert.ok(hit);assert.equal(notifications,0);
 assert.deepEqual(readdirSync(f.destination).filter(n=>!n.startsWith('.')).sort(),before);
 if(boundary==='ssh')assert.equal(f.calls.length,0);
}));
test('round7: actual 3 daily/2 weekly/3 monthly Windows pruning unlocks and notifies',()=>fixture(async f=>{
 const dates=['2025-10-31T23:00:00Z','2025-11-30T00:00:00Z','2025-12-01T00:00:00Z','2025-12-28T23:00:00Z','2025-12-29T00:00:00Z','2025-12-31T00:00:00Z','2026-01-01T01:00:00Z','2026-01-01T23:00:00Z','2026-01-02T00:00:00Z'];
 for(const date of dates)trio(f.destination,date);trio(f.remote,dates.at(-1));let pushes=0;
 const keep=selectRetention(dates.map(created=>({created,artifact:artifactNames(created).artifact})));
 const result=await pullBackups({...f.options,run:f.run,notify:()=>{pushes++;assert.equal(existsSync(join(f.destination,'.nexus_s10_pull.lock')),false);}});
 assert.equal(result.retained,5);assert.equal(pushes,1);
 for(const created of dates)for(const name of Object.values(artifactNames(created)))assert.equal(existsSync(join(f.destination,name)),keep.has(artifactNames(created).artifact));
 assert.equal(readdirSync(f.destination).some(n=>n.startsWith('.nexus-retired-')),false);
}));
for(const fault of ['exit','timeout','malformed'])test('round7: pull helper '+fault+' suppresses success/notification',()=>fixture(async f=>{
 const old=trio(f.destination,'2024-01-01T00:00:00Z');for(const created of ['2026-01-01T00:00:00Z','2026-02-01T00:00:00Z','2026-03-01T00:00:00Z'])trio(f.remote,created);let pushes=0;
 await assert.rejects(()=>pullBackups({...f.options,run:f.run,now:()=>new Date('2026-03-01T00:00:00Z'),notify:()=>pushes++,retirement:{deadlineMs:20,spawn:()=>{
  const c=new EventEmitter();c.stdout=new PassThrough();c.stderr=new PassThrough();c.stdin=new PassThrough();c.kill=()=>{};
  if(fault!=='timeout')queueMicrotask(()=>{c.stdout.end(fault==='malformed'?'OK':'NEXUS_RETENTION_OK\r\n');c.emit('close',fault==='exit'?1:0);});return c;
 }}}),e=>e.code==='NEXUS_RETENTION_CLEANUP');assert.equal(pushes,0);for(const name of Object.values(old))assert.ok(existsSync(join(f.destination,name)));
}));
for(const race of ['before-open','before-open-identical','after-completion'])test((race==='before-open-identical'?'round8':'round7')+': pull replacement '+race+' preserves replacement and suppresses notification',()=>fixture(async f=>{
 const old=trio(f.destination,'2024-01-01T00:00:00Z');for(const created of ['2026-01-01T00:00:00Z','2026-02-01T00:00:00Z','2026-03-01T00:00:00Z'])trio(f.remote,created);let pushes=0;const p=join(f.destination,old.artifact);
 await assert.rejects(()=>pullBackups({...f.options,run:f.run,now:()=>new Date('2026-03-01T00:00:00Z'),notify:()=>pushes++,retirement:{spawn:(...args)=>{
  if(race==='before-open-identical'){const bytes=readFileSync(p);renameSync(p,p+'.held-original');writeFileSync(p,bytes);assert.notEqual(lstatSync(p,{bigint:true}).ino,lstatSync(p+'.held-original',{bigint:true}).ino);}if(race==='before-open')writeFileSync(p,'replacement');const child=spawn(...args);if(race==='after-completion')child.prependListener('close',code=>{assert.equal(code,0);writeFileSync(p,'replacement');});return child;
 }}}),e=>e.code==='NEXUS_RETENTION_CLEANUP');assert.equal(pushes,0);assert.equal(readFileSync(p,'utf8'),race==='before-open-identical'?'encrypted':'replacement');
}));
test('round6: later pull publication failure preserves substituted directory and all earlier members',()=>fixture(async f=>{
 const n=trio(f.remote,'2026-01-02T00:00:00Z');let links=0,pushes=0;
 await assert.rejects(()=>pullBackups({...f.options,run:f.run,notify:()=>pushes++,publication:{link:(s,t)=>{if(++links===4){const p=join(f.destination,n.artifact);unlinkSync(p);mkdirSync(p);writeFileSync(join(p,'evidence'),'replacement');throw Error('later failure');}linkSync(s,t);}}}),e=>e.code==='NEXUS_PUBLICATION_CLEANUP');assert.ok(existsSync(join(f.destination,n.artifact,'evidence')));assert.ok(existsSync(join(f.destination,n.sidecar)));assert.ok(existsSync(join(f.destination,n.metadata)));assert.equal(pushes,0);
}));
const project='nexus_prod_example';
// Explicit listing injection: production never routes listing through the synchronous runner.
const pullBackups=o=>productionPullBackups({...o,list:o.list??(async args=>o.run('ssh',args))});
import {aggregates} from './fixtures/recovery.mjs';
import {testPrivateKey,testPublicKey} from './fixtures/signing.mjs';
import {signEnvelope} from './production-signing.mjs';
function trio(dir,created,expectedProject=project){const n=artifactNames(created);const m={version:2,recipientFingerprint:'a'.repeat(64),aggregates,created,project:expectedProject,commit:'a'.repeat(40),imageIds:Object.fromEntries(['api','frontend','postgres'].map(s=>[s,'sha256:'+'e'.repeat(64)])),images:{api:'nexus-api:'+'a'.repeat(40),frontend:'nexus-frontend:'+'a'.repeat(40),postgres:'postgres:18@sha256:979bccfde35445db618c65107d27d08c6c21339d8dc3ad4c830c6633947be0e4'},services:['api','frontend','migrate','postgres'],migrationCount:3,keyFingerprint:'b'.repeat(64),inventory:Object.fromEntries(['database.dump','keys.tar','includes/production.env','includes/database-password','includes/certificate.pem','includes/certificate-key.pem','includes/npm-current.json','includes/npm-rollback.json'].map(k=>[k,'c'.repeat(64)]))};writeFileSync(join(dir,n.artifact),'encrypted');writeFileSync(join(dir,n.sidecar),hash('encrypted')+'  '+n.artifact+'\n');const meta=JSON.stringify(m);writeFileSync(join(dir,n.metadata),meta);writeFileSync(join(dir,n.signature),signEnvelope(n.artifact,m,Buffer.from('encrypted'),Buffer.from(meta),testPrivateKey));return n;}
function fixture(fn){const d=mkdtempSync(join(process.platform==='linux'?homedir():tmpdir(),'nexus_s10_pull_'));return Promise.resolve().then(()=>{const root=join(d,'repo'),remote=join(d,'remote'),destination=join(d,'dest');for(const p of [root,remote,destination])mkdirSync(p);const key=join(d,'key');writeFileSync(key,'fake');const calls=[];const verificationKey=join(d,'verification.pem');writeFileSync(verificationKey,testPublicKey);const options={root,destination,key,verificationKey,recipientFingerprint:'a'.repeat(64),host:'backup.example.invalid',user:'backup',remote:'/private/backups',project,daily:3,weekly:2,monthly:3,transfer:async(args,target,cap)=>{const file=args.at(-1).split('/').at(-1);const bytes=readFileSync(join(remote,file));if(bytes.length>cap)throw Error('bounded');run('scp',[...args,target]);},now:()=>new Date('2026-01-02T00:00:00Z')};const run=(e,a)=>{calls.push([e,a]);if(e==='ssh')return Buffer.from(readdirSync(remote).join('\n'));if(e==='scp'){const file=a.at(-2).split('/').at(-1);copyFileSync(join(remote,file),a.at(-1));return Buffer.alloc(0);}throw Error('unexpected');};return fn({d,root,remote,destination,options,run,calls});}).finally(()=>rmSync(d,{recursive:true,force:true}));}
test('round5: replacement before pull release preserves the new owner',()=>fixture(async f=>{
 trio(f.remote,'2026-01-02T00:00:00Z');let pushes=0;const lock=join(f.destination,'.nexus_s10_pull.lock');
 await assert.rejects(()=>pullBackups({...f.options,run:f.run,now:()=>{rmSync(lock,{recursive:true});mkdirSync(lock);writeFileSync(join(lock,'replacement-token'),'new');return new Date('2026-01-02T00:00:00Z');},notify:()=>pushes++}),e=>e.code==='NEXUS_PULL_LOCK_CLEANUP');
 assert.equal(pushes,0);assert.equal(readFileSync(join(lock,'replacement-token'),'utf8'),'new');
}));
for(const kind of Object.keys(quartetLimits))test('round5: hardlinked '+kind+' rejected by envelope and preexisting pull',()=>fixture(async f=>{
 const n=trio(f.destination,'2026-01-02T00:00:00Z');linkSync(join(f.destination,n[kind]),join(f.d,'alias'));let pushes=0;
 assert.throws(()=>verifyEnvelope(f.destination,n.artifact,project,f.options.verificationKey,f.options.recipientFingerprint));
 await assert.rejects(()=>pullBackups({...f.options,run:f.run,notify:()=>pushes++}));assert.equal(f.calls.length,0);assert.equal(pushes,0);
}));
for(const kind of Object.keys(quartetLimits))test('round5: staged hardlinked '+kind+' refuses publication/pruning/notify',()=>fixture(async f=>{
 trio(f.remote,'2026-01-02T00:00:00Z');let pushes=0,deletes=0;
 await assert.rejects(()=>pullBackups({...f.options,run:f.run,transfer:async(args,target,cap)=>{await f.options.transfer(args,target,cap);if(target.endsWith(Object.values(artifactNames('2026-01-02T00:00:00Z'))[Object.keys(quartetLimits).indexOf(kind)]))linkSync(target,join(f.d,'alias'));},notify:()=>pushes++,remove:()=>deletes++}));
 assert.equal(pushes,0);assert.equal(deletes,0);assert.deepEqual(readdirSync(f.destination),[]);
}));
for(const mode of ['cap+1','single-line','exit','timeout','utf8','duplicate'])test('round5: listing '+mode+' refuses before transfer/prune/notify',()=>fixture(async f=>{
 let transfers=0,deletes=0,pushes=0,killed=false;const n=trio(f.destination,'2026-01-02T00:00:00Z');
 const list=args=>listBounded(args,{deadlineMs:10,spawn:(exe,argv,o)=>{
  assert.equal(o.shell,false);assert.ok(argv.includes('StrictHostKeyChecking=yes'));assert.equal(argv.at(-4),'ls');
  const c=new EventEmitter();c.stdout=new PassThrough();c.stderr=new PassThrough();c.kill=()=>{killed=true;queueMicrotask(()=>c.emit('close',null));};
  queueMicrotask(()=>{const b=mode==='cap+1'?Buffer.alloc(listingByteCap+1):mode==='single-line'?Buffer.from('x'.repeat(257)+'\n'):mode==='utf8'?Buffer.from([255]):mode==='duplicate'?Buffer.from(n.artifact+'\n'+n.artifact):Buffer.from(n.artifact);c.stdout.write(b);if(mode!=='timeout'){c.stdout.end();c.emit('close',mode==='exit'?1:0);}});return c;
 }});
 await assert.rejects(()=>pullBackups({...f.options,list,transfer:()=>transfers++,remove:()=>deletes++,notify:()=>pushes++}));
 assert.equal(transfers,0);assert.equal(deletes,0);assert.equal(pushes,0);if(['cap+1','exit','timeout'].includes(mode))assert.equal(killed,true);assert.ok(existsSync(join(f.destination,n.artifact)));
}));
test('round4: lock cleanup throws or silently leaves exact lock: no notification or success result',async()=>{
 for(const fault of ['throw','noop'])await fixture(async f=>{
  const n=trio(f.remote,'2026-01-02T00:00:00Z');let pushes=0,returned=false;
  await assert.rejects(async()=>{await pullBackups({...f.options,run:f.run,lockCleanup:()=>{if(fault==='throw')throw Error('private-path-config-token');},notify:()=>pushes++});returned=true;},e=>e.code==='NEXUS_PULL_LOCK_CLEANUP'&&!e.message.includes(f.d)&&!e.message.includes('private-path-config-token'));
  assert.equal(returned,false);assert.equal(pushes,0);assert.ok(existsSync(join(f.destination,'.nexus_s10_pull.lock')));assert.ok(existsSync(join(f.destination,n.artifact)));assert.ok(!readdirSync(f.destination).some(n=>n.endsWith('.partial')));
 });
});
test('round4: ordinary success unlocks before notification; a new owner is not removed by old finally',()=>fixture(async f=>{
 trio(f.remote,'2026-01-02T00:00:00Z');const lock=join(f.destination,'.nexus_s10_pull.lock');
 const result=await pullBackups({...f.options,run:f.run,notify:()=>{assert.equal(existsSync(lock),false);mkdirSync(lock);writeFileSync(join(lock,'new-owner'),'evidence');}});
 assert.equal(result.retained,1);assert.ok(existsSync(join(lock,'new-owner')));
}));
test('round4: pull CLI lock cleanup failure emits neither heartbeat nor retention success text',async()=>{
 for(const fault of ['throw','noop'])await fixture(async f=>{
  const created=new Date().toISOString().replace(/\.\d{3}Z$/,'Z');trio(f.destination,created);
  const config=join(f.d,'notify.json');writeFileSync(config,JSON.stringify({pushUrl:'https://monitor.example.invalid/api/push/dummy'}));
  const installed=operationCandidate(f.d);
  const r=spawnSync(process.execPath,['--import',new URL('./fixtures/lock-cleanup-preload.mjs',import.meta.url).href,join(installed.root,'scripts/pull-production-backup.mjs'),'--host',f.options.host,'--user',f.options.user,'--key',f.options.key,'--verification-key',f.options.verificationKey,'--recipient-fingerprint',f.options.recipientFingerprint,'--remote',f.options.remote,'--destination',f.destination,'--project',project,'--daily','3','--weekly','2','--monthly','3','--private-config',config],{encoding:'utf8',env:{...process.env,NEXUS_TEST_LOCK_FAULT:fault,NEXUS_TEST_DEST:f.destination}});
  assert.equal(r.status,1);assert.doesNotMatch(r.stdout,/TEST_NOTIFICATION|verified|retention complete|retained/i);assert.match(r.stderr,/NEXUS_PULL_LOCK_CLEANUP/);assert.ok(!r.stderr.includes(f.d));assert.doesNotMatch(r.stderr,/private-path-config-token|at file:/);
 });
});
test('round3: independent pull pin refuses staged and zero-transfer preexisting signed artifacts',async()=>{
 for(const preexisting of [true,false])await fixture(async f=>{
  trio(f.remote,'2026-01-02T00:00:00Z');if(preexisting)trio(f.destination,'2026-01-02T00:00:00Z');let pushes=0,deletes=0;
  await assert.rejects(()=>pullBackups({...f.options,recipientFingerprint:'f'.repeat(64),run:f.run,notify:()=>pushes++,remove:()=>deletes++}));
  assert.equal(pushes,0);assert.equal(deletes,0);if(preexisting)assert.equal(f.calls.length,0);
 });
});
test('round3: pull pin gates idempotent conflicts, retention rechecks and immediate pruning rechecks',async()=>{
 for(const gate of ['conflict','retention','pruning'])await fixture(async f=>{
  const created='2026-01-02T00:00:00Z',latest=trio(f.remote,created);let pushes=0,deletes=0,substituted=false;
  const substitute=n=>{const p=join(f.destination,n.metadata),m=JSON.parse(readFileSync(p));m.recipientFingerprint='f'.repeat(64);const bytes=Buffer.from(JSON.stringify(m));writeFileSync(p,bytes);writeFileSync(join(f.destination,n.signature),signEnvelope(n.artifact,m,readFileSync(join(f.destination,n.artifact)),bytes,testPrivateKey));substituted=true;};
  let old;
  if(gate!=='conflict')trio(f.destination,created);
  if(gate==='pruning')for(const date of ['2024-01-01T00:00:00Z','2024-02-01T00:00:00Z','2024-03-01T00:00:00Z']){const n=trio(f.destination,date);old??=n;}
  const run=(e,a)=>{const r=f.run(e,a);if(gate==='retention'&&e==='ssh')substitute(latest);return r;};
  const transfer=async(a,target,cap)=>{await f.options.transfer(a,target,cap);if(gate==='conflict'&&target.endsWith('.signature.json')){trio(f.destination,created);substitute(latest);}};
  await assert.rejects(()=>pullBackups({...f.options,run,transfer,now:()=>{if(gate==='pruning')substitute(old);return new Date(created);},notify:()=>pushes++,remove:()=>deletes++}));
  assert.ok(substituted);assert.equal(pushes,0);assert.equal(deletes,0);
 });
});
test('blocker: oversized remote quartet streams never publish, prune, notify or leave staged bytes',async()=>{
 for(const kind of Object.keys(quartetLimits))await fixture(async f=>{
  const n=trio(f.remote,'2026-01-02T00:00:00Z');truncateSync(join(f.remote,n[kind]),quartetLimits[kind]+1);let pushes=0,deletes=0,publications=0,aborted=false;
  const transfer=(args,target,cap)=>transferBounded(args,target,cap,{spawn:(exe,argv,o)=>{
   assert.equal(exe,'ssh');assert.equal(o.shell,false);assert.ok(argv.includes('StrictHostKeyChecking=yes'));assert.equal(argv.at(-3),'cat');
   const child=new EventEmitter();child.stdout=createReadStream(join(f.remote,basename(argv.at(-1))));child.stderr=new PassThrough();child.kill=()=>{aborted=true;child.stdout.destroy();queueMicrotask(()=>child.emit('close',null));};child.stdout.once('end',()=>child.emit('close',0));return child;
  }});
  await assert.rejects(()=>pullBackups({...f.options,run:f.run,transfer,notify:()=>pushes++,remove:()=>deletes++,publication:{link:()=>{publications++;}}}));
  assert.equal(pushes,0);assert.equal(deletes,0);assert.equal(publications,0);assert.equal(aborted,true);assert.deepEqual(readdirSync(f.destination),[]);
 });
});
test('round6: later publication failure preserves all earlier members without rollback removal',()=>fixture(async f=>{
 const n=trio(f.remote,'2026-01-02T00:00:00Z');let links=0,pushes=0;const attempted=[];
 await assert.rejects(()=>pullBackups({...f.options,run:f.run,notify:()=>pushes++,publication:{link:(s,t)=>{if(++links===4)throw Error('private');linkSync(s,t);}},rollbackRemove:p=>{attempted.push(basename(p));if(p.endsWith(n.artifact))throw Error('private');unlinkSync(p);}}),e=>e.code==='NEXUS_PUBLICATION_CLEANUP');
 assert.deepEqual(attempted,[]);for(const name of [n.artifact,n.sidecar,n.metadata])assert.ok(existsSync(join(f.destination,name)));assert.equal(pushes,0);
}));
test('final: pull publication rollback failures never prune or notify',async()=>{
 for(const rollbackFails of [false,true])await fixture(async f=>{
  const n=trio(f.remote,'2026-01-02T00:00:00Z');let pushes=0,deletes=0;
  await assert.rejects(()=>pullBackups({...f.options,run:f.run,notify:()=>pushes++,remove:()=>deletes++,publication:{link:linkSync,unlink:p=>{if(p.includes('.partial')||rollbackFails)throw Error('private');unlinkSync(p);}}}),e=>e.code==='NEXUS_PUBLICATION_CLEANUP');
  assert.equal(existsSync(join(f.destination,n.artifact)),true);assert.equal(pushes,0);assert.equal(deletes,0);
 });
});
test('final: zero-transfer signed freshness boundaries gate pruning and notification',async()=>{
 for(const [age,ok] of [[0,true],[36*3600000,true],[36*3600000+1000,false],[-600000,true],[-601000,false]])await fixture(async f=>{
  const created='2026-01-02T00:00:00Z';trio(f.remote,created);trio(f.destination,created);if(!ok)for(const old of ['2024-01-01T00:00:00Z','2024-02-01T00:00:00Z','2024-03-01T00:00:00Z','2024-04-01T00:00:00Z'])trio(f.destination,old);let pushes=0,deletes=0;
  const operation=()=>pullBackups({...f.options,run:f.run,now:()=>new Date(Date.parse(created)+age),notify:()=>pushes++,remove:()=>deletes++});
  if(ok)await operation();else await assert.rejects(operation);
  assert.equal(pushes,ok?1:0);assert.equal(deletes,0);assert.equal(f.calls.filter(c=>c[0]==='scp').length,0);
 });
});
test('retention is latest representative union: 3 UTC days, 2 ISO weeks, 3 months across calendar years',()=>{
 const dates=['2025-10-31T23:00:00Z','2025-11-30T00:00:00Z','2025-12-01T00:00:00Z','2025-12-28T23:00:00Z','2025-12-29T00:00:00Z','2025-12-31T00:00:00Z','2026-01-01T01:00:00Z','2026-01-01T23:00:00Z','2026-01-02T00:00:00Z'];
 assert.deepEqual([...selectRetention(dates.map(created=>({created,artifact:created})))].sort(),['2025-11-30T00:00:00Z','2025-12-28T23:00:00Z','2025-12-31T00:00:00Z','2026-01-01T23:00:00Z','2026-01-02T00:00:00Z']);
 assert.equal(selectRetention([{created:dates[0],artifact:'only'}]).size,1);
});
test('pull verifies signed quartets, publishes idempotently, preserves unknown/partial and notifies once only after retention',()=>fixture(async f=>{
 trio(f.remote,'2026-01-01T00:00:00Z');writeFileSync(join(f.remote,'unknown'),'keep');writeFileSync(join(f.destination,'unknown.partial'),'keep');let pushes=0;
 const notify=()=>{pushes++;assert.equal(readdirSync(f.destination).filter(n=>n.endsWith('.metadata.json')).length,1);};
 await pullBackups({...f.options,run:f.run,notify});assert.equal(pushes,1);
 const before=f.calls.filter(c=>c[0]==='scp').length;await pullBackups({...f.options,run:f.run,notify});assert.equal(pushes,2);assert.equal(f.calls.filter(c=>c[0]==='scp').length,before);assert.equal(before,4);assert.equal(readdirSync(f.destination).length,5);
 trio(f.remote,'2026-01-02T00:00:00Z');await pullBackups({...f.options,run:f.run,notify:()=>pushes++});assert.equal(f.calls.filter(c=>c[0]==='scp').length,before+4);
 assert.ok(f.calls.filter(c=>c[0]==='scp').every(c=>dirname(c[1].at(-1)).endsWith('.partial')));
 assert.ok(f.calls.every(c=>Array.isArray(c[1])&&c[1].includes('BatchMode=yes')&&c[1].includes('IdentitiesOnly=yes')&&c[1].includes('StrictHostKeyChecking=yes')));
 assert.ok(readdirSync(f.destination).includes('unknown.partial'));
}));
test('review: corrupt complete local quartet refuses before remote listing',()=>fixture(async f=>{
 const n=trio(f.destination,'2026-01-01T00:00:00Z');trio(f.remote,'2026-01-02T00:00:00Z');writeFileSync(join(f.destination,n.signature),'{}');await assert.rejects(()=>pullBackups({...f.options,run:f.run}));assert.equal(f.calls.length,0);
}));
test('transfer, corrupt sidecar, malformed metadata and conflicting local file all prevent pruning and push',async()=>{
 for(const mode of ['transfer','sidecar','metadata','conflict','signature','ciphertext','forged-metadata'])await fixture(async f=>{
  const old=trio(f.destination,'2024-01-01T00:00:00Z'),latest=trio(f.remote,'2026-01-02T00:00:00Z');let pushes=0;
  if(mode==='sidecar')writeFileSync(join(f.remote,latest.sidecar),'corrupt');
  if(mode==='metadata')writeFileSync(join(f.remote,latest.metadata),'{}');
  if(mode==='signature')writeFileSync(join(f.remote,latest.signature),'{}');
  if(mode==='ciphertext'){writeFileSync(join(f.remote,latest.artifact),'forged');writeFileSync(join(f.remote,latest.sidecar),hash('forged')+'  '+latest.artifact+'\n');}
  if(mode==='forged-metadata'){const m=JSON.parse(readFileSync(join(f.remote,latest.metadata)));m.aggregates.memberships++;writeFileSync(join(f.remote,latest.metadata),JSON.stringify(m));}
  if(mode==='conflict')writeFileSync(join(f.destination,latest.artifact),'different');
  await assert.rejects(()=>pullBackups({...f.options,run:f.run,transfer:mode==='transfer'?async()=>{throw Error('fake-key-private');}:f.options.transfer,notify:()=>pushes++}),e=>!e.message.includes('fake-key-private'));
  assert.equal(pushes,0);assert.equal(readFileSync(join(f.destination,old.artifact),'utf8'),'encrypted');assert.ok(!readdirSync(f.destination).some(n=>n.startsWith('.nexus_s10_pull_')));
 });
});
test('failed pruning never notifies and private Kuma config is used exactly once only after complete success',()=>fixture(async f=>{
 trio(f.destination,'2024-01-01T00:00:00Z');for(const created of ['2026-01-01T00:00:00Z','2026-02-01T00:00:00Z','2026-03-01T00:00:00Z'])trio(f.remote,created);
 let pushes=0;await assert.rejects(()=>pullBackups({...f.options,run:f.run,now:()=>new Date('2026-03-01T00:00:00Z'),retirement:{spawn:()=>{throw Error('private-path');}},notify:()=>pushes++}));assert.equal(pushes,0);
 const privateConfig=join(f.d,'notify.json');writeFileSync(privateConfig,JSON.stringify({pushUrl:'https://monitor.example.invalid/api/push/dummy'}));
 await pushFromPrivateConfig(privateConfig,f.root,async(url,options)=>{pushes++;assert.equal(url.hostname,'monitor.example.invalid');assert.equal(options.redirect,'error');return {ok:true};});assert.equal(pushes,1);
 writeFileSync(privateConfig,JSON.stringify({pushUrl:'http://monitor.example.invalid/api/push/dummy'}));await assert.rejects(()=>pushFromPrivateConfig(privateConfig,f.root,()=>{pushes++;}));assert.equal(pushes,1);
}));
test('retention must verify exact-file removal before sending success',()=>fixture(async f=>{
 trio(f.destination,'2024-01-01T00:00:00Z');for(const created of ['2026-01-01T00:00:00Z','2026-02-01T00:00:00Z','2026-03-01T00:00:00Z'])trio(f.remote,created);
 let pushes=0;await assert.rejects(()=>pullBackups({...f.options,run:f.run,now:()=>new Date('2026-03-01T00:00:00Z'),retirement:{spawn:()=>{throw Error('unverified');}},notify:()=>pushes++}));assert.equal(pushes,0);
}));
test('private notifier configuration failures never echo values or file paths',()=>fixture(async f=>{
 const path=join(f.d,'private-notifier.json');writeFileSync(path,JSON.stringify({pushUrl:'not-a-url-private-token'}));
 await assert.rejects(()=>pushFromPrivateConfig(path,f.root),e=>e.input===undefined&&!e.message.includes('not-a-url-private-token')&&!e.message.includes(f.d));
 await assert.rejects(()=>pushFromPrivateConfig(join(f.d,'missing-private-path'),f.root),e=>!e.message.includes(f.d));
}));
test('absurd remote listing refuses without transfers, pruning or notification',()=>fixture(async f=>{
 let pushes=0;await assert.rejects(()=>pullBackups({...f.options,run:(e,a)=>e==='ssh'?Buffer.from('unknown\n'.repeat(10001)):f.run(e,a),notify:()=>pushes++}));assert.equal(pushes,0);assert.equal(f.calls.length,0);
}));
test('pull refuses shell fragments, missing explicit counts and wrong retention contract',()=>{
 assert.throws(()=>parsePullOptions([]));
 const args=['--host','backup.invalid','--user','backup','--key','/private/key','--verification-key','/private/public.pem','--recipient-fingerprint','a'.repeat(64),'--remote','/private/backups','--destination','/private/local','--project',project,'--daily','3','--weekly','2','--monthly','3'];
 for(const pin of ['REPLACE_ME','A'.repeat(64),'a'.repeat(63),'a'.repeat(65)])assert.throws(()=>parsePullOptions(args.map(x=>x==='a'.repeat(64)?pin:x)));
 assert.throws(()=>parsePullOptions(args.filter((_,i)=>![8,9].includes(i))));
 assert.equal(parsePullOptions(args).daily,3);assert.throws(()=>parsePullOptions([...args,'--daily','2']));
 assert.throws(()=>parsePullOptions(args.map(x=>x==='backup.invalid'?'bad;command':x)));
});
