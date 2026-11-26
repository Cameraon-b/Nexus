import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,existsSync,chmodSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {privateCustody} from './fixtures/operation-candidate.mjs';
import {recoverCustodyLock} from './production-lock-custody.mjs';
import {testBinding as bindOperationCustody} from './fixtures/operation-candidate.mjs';
for(const kind of ['empty','extra','mode'])test('round13 provisional recovery '+kind,async()=>{
 const d=mkdtempSync(join(homedir(),'.nexus-r13-empty-'));
 try{privateCustody(d);const a=join(d,'tools/candidates/a');mkdirSync(a,{recursive:true});const config=join(d,'config');writeFileSync(config,'{}',{mode:0o600});const project='nexus_prod_'+createHash('sha256').update(d).digest('hex');const root=join(d,'.nexus-production-locks'),lock=join(root,createHash('sha256').update(project).digest('hex')+'.lock');mkdirSync(root,{mode:0o700});mkdirSync(lock,{mode:0o700});
 if(kind==='extra')writeFileSync(join(lock,'unknown'),'preserve');
 if(kind==='mode'){if(process.platform==='linux')chmodSync(lock,0o755);else {const {spawnSync}=await import('node:child_process');assert.equal(spawnSync('icacls.exe',[lock,'/grant','*S-1-1-0:W']).status,0);}}
 const b=bindOperationCustody(config,a);
 if(kind==='empty'){assert.equal(await recoverCustodyLock(project,config,b),'recovered');assert.equal(existsSync(lock),false);}else{await assert.rejects(async()=>recoverCustodyLock(project,config,b));assert.equal(existsSync(lock),true);}
 }finally{rmSync(d,{recursive:true,force:true,maxRetries:20,retryDelay:50});}
});
