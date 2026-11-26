import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,existsSync,symlinkSync,rmSync,statSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {privateCustody} from './fixtures/operation-candidate.mjs';
import {acquireOperationLock} from './production-operations.mjs';
import {testBinding as operationLockRoot} from './fixtures/operation-candidate.mjs';
test('round9: validate containment and redirection before creating only the exact private external directory',async()=>{
 const d=mkdtempSync(join(tmpdir(),'nexus-r9-paths-'));
 try{
  privateCustody(d);
  const root=join(d,'tools','candidates','test'),privateRoot=join(d,'private');mkdirSync(root,{recursive:true});mkdirSync(privateRoot);
  const inside=join(root,'config');writeFileSync(inside,'');
  assert.throws(()=>operationLockRoot(inside,root));assert.equal(existsSync(join(root,'.nexus-production-locks')),false);
  assert.throws(()=>operationLockRoot(join(privateRoot,'missing','config'),root));assert.equal(existsSync(join(privateRoot,'missing')),false);
  const config=join(privateRoot,'config');writeFileSync(config,'');
  const alias=join(d,'alias');symlinkSync(privateRoot,alias,'junction');
  assert.throws(()=>operationLockRoot(join(alias,'config'),root));assert.equal(existsSync(join(privateRoot,'.nexus-production-locks')),false);
  const binding=operationLockRoot(config,root),locks=binding.directory;assert.equal(locks,resolve(d,'.nexus-production-locks'));
  await (await acquireOperationLock('nexus_prod_round9',config,binding))();
  if(process.platform!=='win32')assert.equal(statSync(locks).mode&0o777,0o700);
  for(const remove of [()=>{},()=>{throw Error('synthetic removal failure');}]){
   const release=acquireOperationLock('nexus_prod_round9',config,locks,{remove});
   assert.throws(release,{code:'NEXUS_OPERATION_LOCK_CLEANUP'});
   // Exact synthetic fixture only; never stale-lock recovery in real custody.
   rmSync(locks,{recursive:true});mkdirSync(locks,{mode:0o700});
  }
 }finally{rmSync(d,{recursive:true,force:true});}
});
