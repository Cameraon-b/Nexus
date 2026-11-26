import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,renameSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {processIdentity} from './production-process-identity.mjs';
import {spawnNode} from './fixtures/spawn-node.mjs';
import {privateCustody,operationCandidate,removeFixture as rmSync} from './fixtures/operation-candidate.mjs';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {pathToFileURL} from 'node:url';
import {acquireCustodyLock,recoverCustodyLock} from './production-lock-custody.mjs';
import {testBinding as bindOperationCustody} from './fixtures/operation-candidate.mjs';
async function fixture(fn){const d=mkdtempSync(join(homedir(),'.nexus-r12-recovery-'));try{privateCustody(d);const a=join(d,'tools/candidates/a');mkdirSync(a,{recursive:true,mode:0o700});const config=join(d,'config');writeFileSync(config,'synthetic',{mode:0o600});const project='nexus_prod_'+createHash('sha256').update(d).digest('hex');await fn({d,a,config,project,binding:()=>bindOperationCustody(config,a)});}finally{rmSync(d,{recursive:true,force:true,maxRetries:20,retryDelay:50});}}
async function stale(f){
 const owner=spawnNode(['-e','setInterval(()=>{},1000)']);
 const b=f.binding(),request={version:1,action:'acquire',owner:processIdentity(owner.pid),bindings:b.bindings,custody:b.custody,directory:b.directory,config:b.config,key:createHash('sha256').update(f.project).digest('hex')+'.lock',token:'owner-'+'a'.repeat(64)+'.json'};
 let c;
 if(process.platform==='win32')c=spawn('powershell.exe',['-NoProfile','-File','scripts/windows-operation-lock.ps1'],{stdio:['pipe','pipe','pipe']});
 else c=spawn('/usr/bin/python3',['-I','-u','-c',readFileSync('scripts/posix-operation-lock.py','utf8')],{stdio:['pipe','pipe','pipe']});
 if(process.platform==='win32')request.configIdentity=b.configIdentity;
 c.stdin.write(JSON.stringify(request)+'\n');
 let output='';await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{c.kill();reject(Error('helper acquisition timeout'));},10000);c.stdout.on('data',chunk=>{output+=chunk;if(output.includes('"acquired"')){clearTimeout(timer);resolve();}});c.once('close',()=>{clearTimeout(timer);reject(Error('helper died before acquisition'));});});
 const close=once(c,'close');c.kill();await close;
 const ownerClose=once(owner,'close');owner.kill();await ownerClose;
 const lock=join(b.directory,request.key);return {lock,owner:join(lock,request.token)};
}
test('round12 recovery active owner refuses and preserves evidence',()=>fixture(async f=>{const release=await acquireCustodyLock(f.project,f.config,f.binding());try{const before=readdirSync(f.binding().directory);await assert.rejects(async()=>recoverCustodyLock(f.project,f.config,f.binding()));assert.deepEqual(readdirSync(f.binding().directory),before);}finally{await release();}}));
test('round12 helper and exact owner death leave stale evidence; recovery is explicit absent separately',()=>fixture(async f=>{await stale(f);assert.equal(await recoverCustodyLock(f.project,f.config,f.binding()),'recovered');assert.deepEqual(readdirSync(f.binding().directory),[]);assert.equal(await recoverCustodyLock(f.project,f.config,f.binding()),'absent');}));
for(const kind of ['malformed','extra','replacement','mode'])test('round12 recovery preserves '+kind,()=>fixture(async f=>{
 const {lock,owner}=await stale(f);
 if(kind==='malformed')writeFileSync(owner,'unknown');
 if(kind==='extra')writeFileSync(join(lock,'extra'),'unknown');
 if(kind==='replacement'){renameSync(owner,owner+'-evidence');writeFileSync(owner,'unknown');}
 if(kind==='mode') {const {chmodSync}=await import('node:fs');if(process.platform==='linux')chmodSync(owner,0o644);else {const {spawnSync}=await import('node:child_process');assert.equal(spawnSync('icacls.exe',[owner,'/grant','*S-1-1-0:W']).status,0);}}
 const before=readdirSync(lock);await assert.rejects(async()=>recoverCustodyLock(f.project,f.config,f.binding()));assert.deepEqual(readdirSync(lock),before);
}));
for(const where of ['root','project'])test('round12 recovery refuses dangling '+where+' rather than reporting absent',()=>fixture(async f=>{
 const binding=f.binding();let path=binding.directory;
 if(where==='project'){mkdirSync(path,{mode:0o700});path=join(path,createHash('sha256').update(f.project).digest('hex')+'.lock');}
 symlinkSync(join(f.d,'nonexistent'),path,process.platform==='win32'?'junction':'dir');
 await assert.rejects(async()=>recoverCustodyLock(f.project,f.config,binding));
 assert.equal(readdirSync(where==='root'?f.d:binding.directory).includes(where==='root'?'.nexus-production-locks':path.split(/[\\/]/).at(-1)),true);
}));
test('round12 recovery CLI never invokes Docker; exact confirmation gates mutation',()=>fixture(async f=>{
 const {cli}=operationCandidate(f.d);const {lock}=await stale(f);
 const saved={argv:process.argv,exitCode:process.exitCode,log:console.log,error:console.error,spawnSync:childProcess.spawnSync};
 let invocations=0;
 try{
  childProcess.spawnSync=(exe,...args)=>{if(['powershell.exe','python3'].includes(exe))return saved.spawnSync(exe,...args);invocations++;throw Error('Docker must never run');};syncBuiltinESMExports();
  for(const confirmation of ['wrong',f.project,f.project]){
   let output='',errors='';console.log=s=>{output+=s;};console.error=s=>{errors+=s;};process.exitCode=undefined;
   process.argv=[process.execPath,cli,'recover-operation-lock','--project',f.project,'--config-file',f.config,'--confirm-recover-lock',confirmation];
   await import(pathToFileURL(cli).href+'?run='+confirmation+Math.random());
   if(confirmation==='wrong'){assert.equal(process.exitCode,1);assert.equal(readdirSync(lock).length,1);assert.equal(output,'');}
   else {assert.equal(process.exitCode,undefined,errors);assert.match(output,/recovery verified|already absent/);}
   assert.doesNotMatch(output+errors,/owner-|synthetic|[A-Za-z]:\\\\|\/home\//);
  }
  assert.equal(invocations,0);
 }finally{process.argv=saved.argv;process.exitCode=saved.exitCode;console.log=saved.log;console.error=saved.error;childProcess.spawnSync=saved.spawnSync;syncBuiltinESMExports();}
}));
test('round12 recovery refuses a replaced custody binding',()=>fixture(async f=>{const {lock}=await stale(f);const binding=f.binding();renameSync(join(f.d,'tools/candidates/a'),join(f.d,'tools/candidates/old'));mkdirSync(f.a);await assert.rejects(async()=>recoverCustodyLock(f.project,f.config,binding));assert.equal(readdirSync(lock).length,1);}));
