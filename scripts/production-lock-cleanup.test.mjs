import {test} from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync,readdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {acquireOperationLock} from './production-operations.mjs';
const preload=new URL('./fixtures/lock-cleanup-preload.mjs',import.meta.url).href;
test('round4: release verifies exact absence after injected removal no-op',()=>{
 const dir=mkdtempSync(join(tmpdir(),'nexus-lock-unit-')),config=join(dir,'config');writeFileSync(config,'');
 try{
  const release=acquireOperationLock('nexus_s8_unit',config,dir,{remove:()=>{}});
  assert.throws(release,e=>e.code==='NEXUS_OPERATION_LOCK_CLEANUP'&&!e.message.includes(dir));
  assert.ok(readdirSync(dir).some(n=>n.endsWith('.lock')));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('round4: CLI release failure is caught before recovery success, including combined operation failure',()=>{
 const locks=[];
 const dir=mkdtempSync(join(tmpdir(),'nexus-lock-cli-')),config=join(dir,'config');writeFileSync(config,'');
 try{
  for(const command of ['backup','restore-verify'])for(const fault of ['throw','noop','none'])for(const operationError of ['', '1','NEXUS_BACKUP_AVAILABILITY','NEXUS_RESTORE_CLEANUP']){
   const project=`nexus_prod_lock_r4_${process.pid}_${command.replace('-','_')}_${fault}_${operationError||'ok'}`;
   locks.push(join(dir,'.nexus-production-locks',createHash('sha256').update(project).digest('hex')+'.lock'));
   const r=spawnSync(process.execPath,['--import',preload,'scripts/production.mjs',command,'--project',project,'--env-file',config,'--restore-config',config],{encoding:'utf8',env:{...process.env,NEXUS_TEST_RECOVERY:'1',NEXUS_TEST_LOCK_FAULT:fault,NEXUS_TEST_OPERATION_ERROR:operationError}});
   if(fault==='none'){
    assert.equal(r.status,operationError?1:0,r.stderr);assert.equal(existsSync(locks.at(-1)),false);
    if(operationError){assert.equal(r.stdout,'');assert.match(r.stderr,new RegExp(operationError==='1'?'Production operation refused':operationError));}else{assert.match(r.stdout,/Recovery operation verified/);assert.equal(r.stderr,'');}
   }else{
    assert.equal(r.status,1);assert.equal(r.stdout,'');assert.match(r.stderr,/NEXUS_OPERATION_LOCK_CLEANUP/);assert.ok(existsSync(locks.at(-1)));
    if(operationError){const lines=r.stderr.trim().split('\n');assert.equal(lines.length,2);assert.match(lines[0],new RegExp(operationError==='1'?'Production operation refused':operationError));assert.match(lines[1],/NEXUS_OPERATION_LOCK_CLEANUP/);}
   }
   assert.doesNotMatch(r.stderr,/private-path-config-token|at file:/);assert.ok(!r.stderr.includes(dir));
  }
 }finally{
  // Only exact test-owned locks; do not touch other existing operation locks.
  for(const lock of locks)rmSync(lock,{recursive:true,force:true});
  rmSync(dir,{recursive:true,force:true});
 }
});
