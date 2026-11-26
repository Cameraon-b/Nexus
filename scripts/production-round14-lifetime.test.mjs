import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,chmodSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {privateCustody,relaxFixture,removeFixture} from './fixtures/operation-candidate.mjs';
import {bindOperationCustody,acquireCustodyLock} from './production-lock-custody.mjs';
import {createHash} from 'node:crypto';
import {candidateCustody} from './production-candidate-custody.mjs';
import {checkedStep} from './production-resident-lock.mjs';
for(const drift of [false,true])test('round14 native candidate lifetime '+(drift?'in-place drift gates next step and release':'prevents in-place write'),async()=>{
 const d=mkdtempSync(join(resolve('artifacts'),'nexus-r14-lifetime-'));
 try{
  privateCustody(d);
  const sha=b=>createHash('sha256').update(b).digest('hex'),bytes=Buffer.from('reviewed'),manifest=sha(bytes)+' *deployment/compose.production.yaml\n',id=sha(manifest),root=join(d,'tools/candidates',id),config=join(d,'config');
  mkdirSync(join(root,'deployment'),{recursive:true,mode:0o700});writeFileSync(join(root,'deployment/compose.production.yaml'),bytes,{mode:0o600});writeFileSync(join(root,'MANIFEST.sha256'),manifest,{mode:0o600});writeFileSync(join(root,'CANDIDATE_ID'),id+'\n',{mode:0o600});candidateCustody(root,{install:true});
  writeFileSync(config,'{}',{mode:0o600});
  const binding=bindOperationCustody(config,root),release=await acquireCustodyLock('nexus_prod_r14_lifetime_'+sha(d),config,binding);
  const member=join(root,'deployment/compose.production.yaml');
  try{
   if(!drift){
    // Root can bypass DAC on Linux; the drift branch proves detection there.
    if(process.platform!=='linux'||process.getuid()!==0)assert.throws(()=>writeFileSync(member,'in-place mutation'));
    release.check();
   }else{
    relaxFixture(root);
    // Windows deny-write sharing still prevents byte mutation while native
    // handles are held; ACL drift itself must also fail the next step.
    if(process.platform==='linux')writeFileSync(member,'in-place mutation');
    else assert.throws(()=>writeFileSync(member,'in-place mutation'));
    let steps=0;assert.throws(()=>checkedStep(release,()=>steps++));assert.equal(steps,0);
   }
  }finally{if(drift)await assert.rejects(release);else await release();}
 }finally{removeFixture(d,{recursive:true,force:true,maxRetries:20,retryDelay:50});}
});
