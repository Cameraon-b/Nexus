import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {once} from 'node:events';
import {privateCustody} from './fixtures/operation-candidate.mjs';
import {acquireCustodyLock,recoverCustodyLock} from './production-lock-custody.mjs';
import {testBinding as bindOperationCustody} from './fixtures/operation-candidate.mjs';
test('round13 same project contends across alternate installed private custody roots',async()=>{
 const d=mkdtempSync(join(homedir(),'.nexus-r13-global-'));let release,helper,dead=false;
 const original=childProcess.spawn;
 childProcess.spawn=(...args)=>{const c=original(...args);helper=c;return c;};syncBuiltinESMExports();
 try{
 const bindings=[];
 for(const name of ['one','two']){const root=join(d,name);mkdirSync(root);privateCustody(root);const candidate=join(root,'tools/candidates/a');mkdirSync(candidate,{recursive:true});const config=join(root,'config');writeFileSync(config,'{}',{mode:0o600});bindings.push(bindOperationCustody(config,candidate));}
 const project='nexus_prod_'+createHash('sha256').update(d).digest('hex');
 release=await acquireCustodyLock(project,bindings[0].config,bindings[0]);
 const ownerHelper=helper;
 await assert.rejects(async()=>{const other=await acquireCustodyLock(project,bindings[1].config,bindings[1]);await other();},{code:'NEXUS_OPERATION_LOCKED'});
 const closed=once(ownerHelper,'close');ownerHelper.kill();await closed;dead=true;
 assert.throws(()=>release.check());
 await assert.rejects(async()=>acquireCustodyLock(project,bindings[1].config,bindings[1]),{code:'NEXUS_OPERATION_LOCKED'});
 await assert.rejects(async()=>recoverCustodyLock(project,bindings[1].config,bindings[1]));
 }finally{childProcess.spawn=original;syncBuiltinESMExports();if(release){if(dead)await assert.rejects(release());else await release();}rmSync(d,{recursive:true,force:true,maxRetries:20,retryDelay:50});}
});
