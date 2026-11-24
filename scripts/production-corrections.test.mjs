import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync,existsSync,symlinkSync,readdirSync,utimesSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {acquireOperationLock,validateSecret,runMigration} from './production-operations.mjs';
test('start and standalone migration stop frontend and API before touching schema; failure never starts traffic',()=>{
 for(const start of [true,false]){
  const calls=[];runMigration(a=>calls.push(a),start);
  assert.deepEqual(calls[0],['stop','frontend','api']);
  assert.equal(calls[2].at(-1),'migrate');
  assert.equal(calls.length,start?4:3);
  const failed=[];assert.throws(()=>runMigration(a=>{failed.push(a);if(a.includes('--exit-code-from'))throw Error('migration');},start));
  assert.equal(failed.length,4);assert.deepEqual(failed.at(-1),['stop','frontend','api']);
  if(start){const unhealthy=[];assert.throws(()=>runMigration(a=>{unhealthy.push(a);if(a.includes('--no-build'))throw Error('unhealthy new API');},true));assert.deepEqual(unhealthy.at(-1),['stop','frontend','api']);}
 }
});
test('exclusive operation lock refuses concurrent owner, never steals aged lock, releases exact lock',()=>{
 const dir=mkdtempSync(join(tmpdir(),'nexus-lock-test-'));const config=join(dir,'config');writeFileSync(config,'');
 try{const release=acquireOperationLock('nexus_s8_lock',config,dir);const lock=join(dir,readdirSync(dir).find(n=>n.endsWith('.lock')));utimesSync(lock,new Date(0),new Date(0));assert.throws(()=>acquireOperationLock('nexus_s8_lock',join(dir,'..',dir.split(/[\\/]/).at(-1),'config'),dir));release();acquireOperationLock('nexus_s8_lock',config,dir)();}finally{rmSync(dir,{recursive:true,force:true});}
});
test('same Docker project contends across distinct canonical configs while other projects are independent',()=>{
 const dir=mkdtempSync(join(tmpdir(),'nexus-cross-config-'));
 const a=join(dir,'a.env'),b=join(dir,'b.env');writeFileSync(a,'');writeFileSync(b,'');
 let release,other;
 try{
  release=acquireOperationLock('nexus_s8_shared',a,dir);
  other=acquireOperationLock('nexus_s8_other',b,dir);
  assert.throws(()=>acquireOperationLock('nexus_s8_shared',b,dir),{code:'NEXUS_OPERATION_LOCKED'});
 }finally{other?.();release?.();rmSync(dir,{recursive:true,force:true});}
});
test('secret must be absolute and canonically outside the entire build context',()=>{
 const dir=mkdtempSync(join(tmpdir(),'nexus-secret-test-'));const inside=resolve('backend/correction-test-secret');writeFileSync(inside,'test-only');const external=join(dir,'secret');writeFileSync(external,'test-only');
 try{assert.throws(()=>validateSecret('backend/correction-test-secret',process.cwd()));assert.throws(()=>validateSecret(inside,process.cwd()));assert.throws(()=>validateSecret(resolve('backend/../backend/correction-test-secret'),process.cwd()));validateSecret(external,process.cwd());const alias=join(dir,'repository-alias');symlinkSync(process.cwd(),alias,process.platform==='win32'?'junction':'dir');assert.throws(()=>validateSecret(join(alias,'backend','correction-test-secret'),process.cwd()));}finally{rmSync(inside);rmSync(dir,{recursive:true,force:true});}
});
