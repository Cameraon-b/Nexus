import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {privateCustody} from './fixtures/operation-candidate.mjs';
import {testBinding as bindOperationCustody} from './fixtures/operation-candidate.mjs';
import {residentLock} from './production-resident-lock.mjs';
import {spawnNode} from './fixtures/spawn-node.mjs';
function identity(pid){
 if(process.platform==='linux')return {pid:String(pid),start:readFileSync(`/proc/${pid}/stat`,'utf8').split(') ').at(-1).split(' ')[19]};
 const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`(Get-Process -Id ${pid}).StartTime.ToUniversalTime().ToFileTimeUtc().ToString()`],{encoding:'utf8'});
 assert.equal(r.status,0);return {pid:String(pid),start:r.stdout.trim()};
}
function helper(){return process.platform==='linux'?spawn('/usr/bin/python3',['-I','-u','-c',readFileSync('scripts/posix-operation-lock.py','utf8')]):spawn('powershell.exe',['-NoProfile','-File','scripts/windows-operation-lock.ps1']);}
function status(c,request){return new Promise((resolve,reject)=>{
 let output='';const timer=setTimeout(()=>{c.kill();reject(Error('timeout'));},30000);
 c.stdout.on('data',b=>{output+=b;if(output.includes('\n')){clearTimeout(timer);try{resolve(JSON.parse(output.trim()).status);}catch(e){reject(e);}}});
 c.on('error',e=>{clearTimeout(timer);reject(e);});c.stdin.write(JSON.stringify(request)+'\n');
 });}
async function invoke(request){const c=helper(),exit=once(c,'close');const result=await status(c,request);c.stdin.end();await exit;return result;}
test('round13 exact Node owner survives helper death; only owner death permits recovery',async()=>{
 const d=mkdtempSync(join(homedir(),'.nexus-r13-owner-'));let c,owner;
 try{
 privateCustody(d);const candidate=join(d,'tools/candidates/a');mkdirSync(candidate,{recursive:true});const config=join(d,'config');writeFileSync(config,'{}',{mode:0o600});
 const b=bindOperationCustody(config,candidate);
 owner=spawnNode(['-e','setInterval(()=>{},1000)']);
 const request={version:1,action:'acquire',bindings:b.bindings,custody:b.custody,directory:b.directory,config:b.config,key:createHash('sha256').update(d).digest('hex')+'.lock',token:'owner-'+'a'.repeat(64)+'.json',owner:identity(owner.pid)};
 if(process.platform==='win32')request.configIdentity=b.configIdentity;
 c=helper();const release=await residentLock(c,JSON.stringify(request)+'\n');
 release.check();
 const dead=once(c,'close');c.kill();await dead;
 assert.throws(()=>release.check());await assert.rejects(release());
 request.bindings=bindOperationCustody(config,candidate).bindings;
 assert.ok(['refused','locked'].includes(await invoke({...request,action:'recover'})),'live Node must prevent recovery after helper death');
 assert.equal(await invoke(request),'locked','ordinary acquisition must never steal existing state');
 const ownerDead=once(owner,'close');owner.kill();await ownerDead;
 assert.equal(await invoke({...request,action:'recover'}),'recovered');
 assert.equal(await invoke({...request,action:'recover'}),'absent');
 }finally{c?.kill();owner?.kill();rmSync(d,{recursive:true,force:true,maxRetries:20,retryDelay:50});}
});
test('round13 helper refuses mismatched process-start identity before mutation',async()=>{
 const d=mkdtempSync(join(homedir(),'.nexus-r13-start-'));
 try{privateCustody(d);const candidate=join(d,'tools/candidates/a');mkdirSync(candidate,{recursive:true});const config=join(d,'config');writeFileSync(config,'{}',{mode:0o600});const b=bindOperationCustody(config,candidate);
 const request={version:1,action:'acquire',bindings:b.bindings,custody:b.custody,directory:b.directory,config:b.config,key:'b'.repeat(64)+'.lock',token:'owner-'+'c'.repeat(64)+'.json',owner:{...identity(process.pid),start:'1'}};
 if(process.platform==='win32')request.configIdentity=b.configIdentity;
 assert.equal(await invoke(request),'refused');
 }finally{rmSync(d,{recursive:true,force:true,maxRetries:20,retryDelay:50});}
});
