import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,chmodSync,renameSync,rmSync,readdirSync,copyFileSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readPinnedInput} from './production-pinned-input.mjs';
import {finishOperation,operationFailureLines} from './production-operation-outcome.mjs';
import {acquireCustodyLock,recoverCustodyLock} from './production-lock-custody.mjs';
import {testBinding as bindOperationCustody} from './fixtures/operation-candidate.mjs';

test('real Linux resident lock spans candidates/config paths, rename/recreate and async outcomes',async()=>{
 assert.equal(process.platform,'linux');
 const base=mkdtempSync(join(homedir(),'.nexus-round11-'));
 const custody=join(base,'custody'),a=join(custody,'tools/candidates/a'),b=join(custody,'tools/candidates/b');
 const config=join(custody,'private/a/env'),other=join(custody,'private/b/env');
 for(const p of [a,b,join(custody,'private/a'),join(custody,'private/b')])mkdirSync(p,{recursive:true,mode:0o700});
 writeFileSync(config,'synthetic');writeFileSync(other,'synthetic');
 const files=['production-lock-custody.mjs','production-posix-lock.mjs','production-resident-lock.mjs','production-process-identity.mjs','posix-operation-lock.py','windows-operation-lock.ps1'];
 files.push('production-candidate-binding.mjs','production-candidate-custody.mjs','candidate-custody.ps1');
 for(const p of [a,b]){
  for(const file of files){copyFileSync(new URL(file,import.meta.url),join(p,file));chmodSync(join(p,file),0o400);}
  chmodSync(p,0o500);
 }
 const {bindOperationCustody:bind,acquireCustodyLock}=await import(pathToFileURL(join(a,'production-lock-custody.mjs')));
 const bindOperationCustody=(config,candidate)=>bind(config,candidate,{custodyRoot:custody});
 const alternate=await import(pathToFileURL(join(b,'production-lock-custody.mjs')));
 const hash=p=>{const digest=createHash('sha256');for(const file of files)digest.update(readFileSync(join(p,file)));return digest.digest('hex');};
 const before=[hash(a),hash(b)];
 const project='nexus_s8_'+createHash('sha256').update(base).digest('hex');
 let release,independent;
 try{
  release=await acquireCustodyLock(project,config,bindOperationCustody(config,a));
  await assert.rejects(()=>alternate.acquireCustodyLock(project,other,alternate.bindOperationCustody(other,b,{custodyRoot:custody})),{code:'NEXUS_OPERATION_LOCKED'});
  independent=await acquireCustodyLock(project+'_other',other,bindOperationCustody(other,b));
  await independent();independent=undefined;
  await release();await release();release=undefined;
  assert.deepEqual([hash(a),hash(b)],before);
  assert.deepEqual(readdirSync(join(custody,'.nexus-production-locks')),[]);
  release=await acquireCustodyLock(project,config,bindOperationCustody(config,a));
  const pinned=release.inputs;
  assert.ok(pinned,'Linux must return bounded internal pinned consumption paths');
  renameSync(custody,join(base,'old'));
  mkdirSync(a,{recursive:true,mode:0o700});mkdirSync(join(custody,'private/a'),{recursive:true,mode:0o700});writeFileSync(config,'replacement');
  await assert.rejects(()=>acquireCustodyLock(project,config,bindOperationCustody(config,a)),{code:'NEXUS_OPERATION_LOCKED'});
  assert.deepEqual(readdirSync(custody).sort(),['private','tools']);
  assert.equal(readFileSync(pinned.config,'utf8'),'synthetic');
  assert.equal(readPinnedInput(pinned.config,64).toString(),'synthetic');
  assert.throws(()=>readPinnedInput(pinned.config,2));
  const consumed=spawnSync('/usr/bin/python3',['-I','-c','import pathlib,sys;print(pathlib.Path(sys.argv[1]).read_text());print(pathlib.Path("posix-operation-lock.py").read_text(),end="")',pinned.config],{cwd:pinned.candidate,encoding:'utf8'});
  assert.equal(consumed.status,0);assert.equal(consumed.stdout,'synthetic\n'+readFileSync(new URL('posix-operation-lock.py',import.meta.url),'utf8'));
  assert.equal(readFileSync(join(pinned.candidate,'posix-operation-lock.py'),'utf8'),readFileSync(new URL('posix-operation-lock.py',import.meta.url),'utf8'));
  release.check();
  let error;
  try{await finishOperation(Object.assign(Error('private-path'),{code:'NEXUS_BACKUP_AVAILABILITY'}),release);}catch(e){error=e;}
  assert.equal(error.errors.length,2);
  assert.match(operationFailureLines(error)[0],/NEXUS_BACKUP_AVAILABILITY/);
  assert.match(operationFailureLines(error)[1],/NEXUS_OPERATION_LOCK_CLEANUP/);
  assert.doesNotMatch(operationFailureLines(error).join('\n'),/private-path|owner-|pid|hostname/);
  release=undefined;
 }finally{
  if(independent)await independent().catch(()=>{});
  if(release)await release().catch(()=>{});
  for(const p of [a,b,join(base,'old/tools/candidates/a'),join(base,'old/tools/candidates/b')])try{chmodSync(p,0o700);}catch{}
  rmSync(base,{recursive:true,force:true});
 }
});

test('real Linux pinned config survives replacement and dies closed with helper',async()=>{
 const base=mkdtempSync(join(homedir(),'.nexus-r13-inputs-')),candidate=join(base,'tools/candidates/a'),config=join(base,'config');
 mkdirSync(candidate,{recursive:true,mode:0o700});writeFileSync(config,'original',{mode:0o600});const project='nexus_prod_'+createHash('sha256').update(base).digest('hex');let release;
 try{
  release=await acquireCustodyLock(project,config,bindOperationCustody(config,candidate));const pinned=release.inputs;
  renameSync(config,config+'-old');writeFileSync(config,'redirected',{mode:0o600});
  assert.equal(readPinnedInput(pinned.config,64).toString(),'original');
  process.kill(Number(pinned.config.split('/')[2]),'SIGKILL');
  await assert.rejects(release());
  assert.throws(()=>release.check());
  assert.throws(()=>readPinnedInput(pinned.config,64));
  await assert.rejects(()=>recoverCustodyLock(project,config,bindOperationCustody(config,candidate)));
  release=undefined;
 }finally{if(release)await release().catch(()=>{});rmSync(base,{recursive:true,force:true});}
});

test('real Linux executes cached helper bytes despite a post-import pathname replacement',async()=>{
 const base=mkdtempSync(join(homedir(),'.nexus-round11-cache-'));
 const candidate=join(base,'tools/candidates/c'),config=join(base,'private/env');
 mkdirSync(candidate,{recursive:true,mode:0o700});mkdirSync(join(base,'private'),{mode:0o700});writeFileSync(config,'synthetic');
 const files=['production-lock-custody.mjs','production-posix-lock.mjs','production-resident-lock.mjs','production-process-identity.mjs','posix-operation-lock.py','windows-operation-lock.ps1'];
 files.push('production-candidate-binding.mjs','production-candidate-custody.mjs','candidate-custody.ps1');
 for(const file of files)copyFileSync(new URL(file,import.meta.url),join(candidate,file));
 let release;
 try{
  const module=await import(pathToFileURL(join(candidate,'production-lock-custody.mjs')));
  // Synthetic attack on a copied fixture only, never the repository helper.
  writeFileSync(join(candidate,'posix-operation-lock.py'),'raise RuntimeError("mutable helper executed")\n');
  release=await module.acquireCustodyLock('nexus_s8_cache_'+createHash('sha256').update(base).digest('hex'),config,module.bindOperationCustody(config,candidate,{custodyRoot:base}));
  await release();release=undefined;
  assert.deepEqual(readdirSync(join(base,'.nexus-production-locks')),[]);
 }finally{if(release)await release().catch(()=>{});rmSync(base,{recursive:true,force:true});}
});
