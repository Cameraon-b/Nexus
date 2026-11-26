import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,renameSync,rmSync,linkSync,readdirSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {privateCustody} from './fixtures/operation-candidate.mjs';
import {acquireOperationLock} from './production-operations.mjs';
import {testBinding as operationLockRoot} from './fixtures/operation-candidate.mjs';
async function fixture(fn){const d=mkdtempSync(join(tmpdir(),'nexus-r12-'));try{privateCustody(d);const candidate=join(d,'tools','candidates','a');mkdirSync(candidate,{recursive:true});const config=join(d,'config');writeFileSync(config,'{}',{mode:0o600});await fn(d,candidate,config);}finally{rmSync(d,{recursive:true,force:true,maxRetries:20,retryDelay:50});}}
for(const change of ['custody','config-write','config-rename'])test('round12 Windows lifetime prohibits '+change,{skip:process.platform!=='win32'},()=>fixture(async(d,candidate,config)=>{
 const release=await acquireOperationLock('nexus_prod_lifetime',config,operationLockRoot(config,candidate));
 try{assert.throws(()=>change==='custody'?renameSync(d,d+'-moved'):change==='config-write'?writeFileSync(config,'changed'):renameSync(config,config+'-moved'));}finally{await release();}
}));
test('round12 Windows config identity replacement between binding and open refuses',{skip:process.platform!=='win32'},()=>fixture(async(d,candidate,config)=>{
 const binding=operationLockRoot(config,candidate);renameSync(config,config+'-old');writeFileSync(config,'{}');
 await assert.rejects(async()=>acquireOperationLock('nexus_prod_config_replace',config,binding));
}));
test('round12 Windows writable config ACL refuses',{skip:process.platform!=='win32'},()=>fixture(async(d,candidate,config)=>{
 assert.equal(spawnSync('icacls.exe',[config,'/grant','*S-1-1-0:W']).status,0);
 await assert.rejects(async()=>acquireOperationLock('nexus_prod_config_acl',config,operationLockRoot(config,candidate)));
}));
test('round12 Windows config ACL drift during operation prevents release success',{skip:process.platform!=='win32'},()=>fixture(async(d,candidate,config)=>{
 const binding=operationLockRoot(config,candidate),release=await acquireOperationLock('nexus_prod_config_drift',config,binding);
 assert.equal(spawnSync('icacls.exe',[config,'/grant','*S-1-1-0:W']).status,0);
 await assert.rejects(release());assert.equal(readdirSync(binding.directory).length,1);
}));
test('round12 Windows extra token release cleanup refuses and preserves evidence',{skip:process.platform!=='win32'},()=>fixture(async(d,candidate,config)=>{
 const binding=operationLockRoot(config,candidate),release=await acquireOperationLock('nexus_prod_cleanup',config,binding);
 const lock=join(binding.directory,readdirSync(binding.directory)[0]);writeFileSync(join(lock,'extra'),'evidence');
 await assert.rejects(release());assert.equal(readdirSync(lock).length,2);
}));
for(const fault of ['cleanup','replacement'])test('round12 native Windows recovery '+fault+' at held-handle boundary',{skip:process.platform!=='win32'},()=>fixture(async(d,candidate,config)=>{
 const project='nexus_prod_native_recover',key=createHash('sha256').update(project).digest('hex')+'.lock',token='owner-'+'b'.repeat(64)+'.json';
 const directory=join(d,'.nexus-production-locks'),lock=join(directory,key);mkdirSync(directory);mkdirSync(lock);writeFileSync(join(lock,token),JSON.stringify({version:1,token,pid:String(process.pid),start:'1'})+'\n');
 const binding=operationLockRoot(config,candidate),request={version:1,action:'recover',bindings:binding.bindings,custody:binding.custody,directory,config,configIdentity:binding.configIdentity,key,token,owner:{pid:String(process.pid),start:'1'}};
 let code=readFileSync('scripts/windows-operation-lock.ps1','utf8').replaceAll('\r\n','\n').split("-TypeDefinition @'\n")[1].split("\n'@")[0];
 if(fault==='cleanup')code=code.replace('static void Delete(SafeFileHandle h) {','static int TestDeletes; static void Delete(SafeFileHandle h) { if(++TestDeletes==2)throw new IOException();');
 else code=code.replace('Remove(lockPath,ownerPath,lockHandle,tokenHandle,stale);','int denied=0;try { File.Move(ownerPath,ownerPath+"-replaced"); } catch(IOException) { denied++; } try { Directory.Move(lockPath,lockPath+"-replaced"); } catch(IOException) { denied++; } Need(denied==2);Remove(lockPath,ownerPath,lockHandle,tokenHandle,stale);');
 const script=join(d,'native-recovery.ps1'),quote=s=>"'"+s.replaceAll("'","''")+"'";
 writeFileSync(script,"$ErrorActionPreference='Stop'\nAdd-Type -ReferencedAssemblies System.Web.Extensions -TypeDefinition @'\n"+code+"\n'@\ntry { [Console]::WriteLine([NexusOperationLock]::Run("+quote(JSON.stringify(request))+")) } catch { [Console]::WriteLine('refused') }");
 const result=spawnSync('powershell.exe',['-NoProfile','-File',script],{encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr);
 assert.equal(result.stdout.trim(),fault==='cleanup'?'refused':'{"status":"recovered"}');assert.equal(existsSync(lock),fault==='cleanup');
}));
test('round12 Windows multiply linked config refuses',{skip:process.platform!=='win32'},()=>fixture(async(d,candidate,config)=>{linkSync(config,config+'-link');await assert.rejects(async()=>acquireOperationLock('nexus_prod_links',config,operationLockRoot(config,candidate)));}));
