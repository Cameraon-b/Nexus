import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execute,removePrivate} from './production-backup.mjs';
import {acquireOperationLock,operationLockRoot} from './production-operations.mjs';
import {operationCandidate,removeFixture as rmSync} from './fixtures/operation-candidate.mjs';

test('runner forces argument arrays, shell false and captured output regardless of caller options',()=>{
 let calls=0;
 const output=execute(process.execPath,['-e',''],{shell:true,stdio:'inherit'},(exe,args,opts)=>{calls++;assert.ok(Array.isArray(args));assert.equal(opts.shell,false);assert.equal(opts.stdio,'pipe');return {status:0,stdout:Buffer.from('ok')};});
 assert.equal(calls,1);assert.equal(output.toString(),'ok');
 assert.throws(()=>execute(process.execPath,'not-an-array',{},()=>({status:0,stdout:''})));
});
test('unverifiable private cleanup has a dedicated generic recovery warning without paths',()=>{
 assert.throws(()=>removePrivate('\u0000private-do-not-display'),e=>e.code==='NEXUS_RECOVERY_CLEANUP'&&!e.message.includes('private-do-not-display'));
});
test('restore CLI locks only its disposable identity with canonical restore config, without source env',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'nexus_restore_lock_')),config=join(dir,'restore.json');writeFileSync(config,'{}');
 const project='nexus_s10_restore_lock_'+process.pid,locks=join(dir,'.nexus-production-locks');
 const {cli,root}=operationCandidate(dir);
 try{const release=await acquireOperationLock(project,config,operationLockRoot(config,root));try{
  const r=spawnSync(process.execPath,[cli,'restore-verify','--project',project,'--restore-config',config,'--backup-config',join(dir,'absent'),'--artifact',join(dir,'absent-artifact'),'--confirm-disposable',project],{encoding:'utf8'});
  assert.equal(r.status,1);assert.match(r.stderr,/operation lock is held/);assert.ok(!r.stderr.includes(dir));
 }finally{await release();}}finally{rmSync(dir,{recursive:true,force:true});}
});
test('backup and every inherited mutation share the exact project lock in both ownership directions',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'nexus_s10_locks_')),env=join(dir,'env');writeFileSync(env,'fake');
 const project='nexus_prod_s10_lock_'+process.pid,locks=join(dir,'.nexus-production-locks');
 const {cli,root}=operationCandidate(dir);
 try{for(const owner of ['backup','build','migrate','start','stop','destroy']){
  // Same shared primitive every command invokes; no Docker commands are reached.
  const release=await acquireOperationLock(project,env,operationLockRoot(env,root));
  try{for(const command of owner==='backup'?['build','migrate','start','stop','destroy','backup']:['backup']){
   const args=[cli,command,'--project',project,'--config-file',env,...(command==='backup'?['--backup-config',join(dir,'absent')]:[]),...(command==='destroy'?['--confirm-destroy',project]:[])];
   const r=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(r.status,1);assert.match(r.stderr,/operation lock is held/);assert.ok(!r.stderr.includes(dir));
  }}finally{await release();}
 }}finally{rmSync(dir,{recursive:true,force:true});}
});
