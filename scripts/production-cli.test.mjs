import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {operationCandidate,removeFixture as rmSync} from './fixtures/operation-candidate.mjs';
import {acceptanceEnvironment} from './production-acceptance-config.mjs';
test('explicit configuration cannot inherit conflicting shell secrets or interpolation settings',()=>{
 const dir=mkdtempSync(join(tmpdir(),'nexus-explicit-config-'));
 try{
  writeFileSync(join(dir,'database-password'),'disposable-config-only');
  const env=join(dir,'production.env');
  writeFileSync(env,acceptanceEnvironment({commit:'bd054b4a63d453488b7207651fdaad0df4e9df0b',dir,octet:100,frontendPort:49991}));
  const r=spawnSync(process.execPath,['scripts/production.mjs','validate','--project','nexus_s8_explicit_config','--config-file',env],{encoding:'utf8',env:{...process.env,NEXUS_SECRET_FILE:join(dir,'must-not-be-used'),NEXUS_COMMIT:'invalid-inherited-tag'}});
  assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/Production configuration valid/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('validation rejects an existing backend secret before Compose can use its build context',()=>{
 const dir=mkdtempSync(join(tmpdir(),'nexus-repository-secret-')),secret=resolve('backend',`correction-secret-${process.pid}`);
 try{
  writeFileSync(secret,'disposable-validator-only');const config=join(dir,'production.env');
  writeFileSync(config,acceptanceEnvironment({commit:'bd054b4a63d453488b7207651fdaad0df4e9df0b',dir,octet:100,frontendPort:49991}).replace(/^NEXUS_SECRET_FILE=.*$/m,`NEXUS_SECRET_FILE=${secret.replaceAll('\\','/')}`));
  const r=spawnSync(process.execPath,['scripts/production.mjs','validate','--project','nexus_s8_repo_secret','--config-file',config],{encoding:'utf8'});
  assert.equal(r.status,1);assert.match(r.stderr,/Production operation refused/);
 }finally{rmSync(secret,{force:true});rmSync(dir,{recursive:true,force:true});}
});
test('emergency status/stop/confirmed destroy work without database secret; service-starting commands refuse',()=>{
 const dir=mkdtempSync(join(tmpdir(),'nexus-recovery-config-'));
 try{
  const config=join(dir,'production.env');writeFileSync(config,acceptanceEnvironment({commit:'bd054b4a63d453488b7207651fdaad0df4e9df0b',dir,octet:100,frontendPort:49991}));
  const {cli}=operationCandidate(dir);
  const project='nexus_s8_recovery_'+process.pid;
  for(const command of ['validate','build','migrate','start','status','stop','destroy']){
   const r=spawnSync(process.execPath,[cli,command,'--project',project,'--config-file',config,...(command==='destroy'?['--confirm-destroy',project]:[])],{encoding:'utf8'});
   assert.equal(r.status,['status','stop','destroy'].includes(command)?0:1,command+': '+r.stderr);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('separate CLI processes cannot overlap any mutating operation',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'nexus-concurrent-config-')),config=join(dir,'production.env');writeFileSync(config,'');
 const otherConfig=join(dir,'other.env');writeFileSync(otherConfig,'');
 const {cli,root}=operationCandidate(dir);
 const project='nexus_s8_lock_'+process.pid;
 const owner=spawn(process.execPath,['--input-type=module','-e',`import {acquireOperationLock,operationLockRoot} from './scripts/production-operations.mjs';const release=await acquireOperationLock(process.argv[1],process.argv[2],operationLockRoot(process.argv[2],process.argv[3]));console.log('locked');process.stdin.once('data',async()=>{await release();process.exit();});`,project,config,root],{stdio:['pipe','pipe','pipe']});
 try{
  await once(owner.stdout,'data');
  for(const command of ['build','migrate','start','stop','destroy']){
   const r=spawnSync(process.execPath,[cli,command,'--project',project,'--config-file',otherConfig,...(command==='destroy'?['--confirm-destroy',project]:[])],{encoding:'utf8'});
   assert.equal(r.status,1);assert.match(r.stderr,/operation lock is held/);
  }
 }finally{owner.stdin.write('release');await once(owner,'exit');rmSync(dir,{recursive:true,force:true});}
});
test('production operations require explicit project/config and destructive confirmation',()=>{
 for(const args of [[],['stop'],['destroy','--project','nexus'],['destroy','--project','nexus_s8_test','--config-file','missing']]){
  const r=spawnSync(process.execPath,['scripts/production.mjs',...args],{encoding:'utf8'});
  assert.equal(r.status,1);assert.match(r.stderr,/Production operation refused:/);assert.ok(!r.stderr.includes('MODULE_NOT_FOUND'));
 }
});
