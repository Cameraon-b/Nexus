import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,mkdirSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {processIdentity} from './production-process-identity.mjs';
import {join} from 'node:path';
import {tmpdir,hostname} from 'node:os';
import {testBinding as operationLockRoot} from './fixtures/operation-candidate.mjs';
import {privateCustody} from './fixtures/operation-candidate.mjs';
const source=readFileSync(new URL('./windows-operation-lock.ps1',import.meta.url),'utf8').replaceAll('\r\n','\n').split("-TypeDefinition @'\n")[1].split("\n'@")[0];
const quote=s=>"'"+s.replaceAll("'","''")+"'";
function fixture(fn){const d=mkdtempSync(join(tmpdir(),'nexus-r10-handles-'));try{privateCustody(d);const a=join(d,'tools','candidates','a');mkdirSync(a,{recursive:true});const config=join(d,'config');writeFileSync(config,'{}');const b=operationLockRoot(config,a);fn(d,{version:1,action:'acquire',owner:processIdentity(),bindings:b.bindings,custody:b.custody,directory:b.directory,key:'a'.repeat(64)+'.lock',token:'owner-'+'b'.repeat(64)+'.json',config:b.config,configIdentity:b.configIdentity});}finally{rmSync(d,{recursive:true,force:true});}}
function compiled(d,code,body){const p=join(d,'test.ps1');writeFileSync(p,"$ErrorActionPreference='Stop'\nAdd-Type -ReferencedAssemblies System.Web.Extensions -TypeDefinition @'\n"+code+"\n'@\n[Console]::SetIn([IO.StringReader]::new('{\"action\":\"release\"}'+[char]10))\n"+body);const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',p],{encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr);return r.stdout.trim().split(/\r?\n/).at(-1);}
test('round10: actual held Windows ancestry prevents rename/reparse redirection through child creation',()=>fixture((d,r)=>{
 const method=`public static string Prove(string json) { int refused=0; AfterValidation=delegate { foreach(string p in new string[]{@"${r.custody}",@"${r.directory}"}) { try { Directory.Move(p,p+"-moved"); } catch(IOException) { refused++; } } if(refused!=2)throw new Exception("Expected two handle refusals: "+refused); }; return Run(json); }`;
 const code='#define NEXUS_OPERATION_LOCK_TEST\n'+source.replace('    public static string Run(string json)',method+'\n    public static string Run(string json)');
 const result=JSON.parse(compiled(d,code,`[NexusOperationLock]::Prove(${quote(JSON.stringify(r))})`));assert.equal(result.status,'released');assert.equal(readdirSync(r.directory).length,0);
}));
test('round10: atomic provisional handle defeats an old pathname release before token creation',()=>fixture((d,r)=>{
 const method='public static string Prove(string json) { AfterProvisionalCreate=delegate(string p) { bool refused=false;try { Directory.Delete(p); } catch(IOException) { refused=true; } if(!refused)throw new Exception(); }; return Run(json); }';
 const code='#define NEXUS_OPERATION_LOCK_TEST\n'+source.replace('    public static string Run(string json)',method+'\n    public static string Run(string json)');
 const result=JSON.parse(compiled(d,code,`[NexusOperationLock]::Prove(${quote(JSON.stringify(r))})`));assert.equal(result.status,'released');
}));
test('round10: normal helper has no fault callbacks',()=>fixture((d)=>{
 assert.equal(compiled(d,source,"([NexusOperationLock].GetField('AfterValidation') -eq $null) -and ([NexusOperationLock].GetField('AfterProvisionalCreate') -eq $null)"),'True');
}));
test('round10: native setup uncertainty preserves evidence with cleanup failure',()=>fixture((d,r)=>{
 const code='#define NEXUS_OPERATION_LOCK_TEST\n'+source;
 const result=JSON.parse(compiled(d,code,`[NexusOperationLock]::AfterProvisionalCreate = { throw 'injected setup refusal' }\n[NexusOperationLock]::Run(${quote(JSON.stringify(r))})`));assert.equal(result.status,'cleanup');assert.deepEqual(readdirSync(join(r.directory,r.key)),[]);
}));
test('round10: native helper closed schema rejects duplicate fields before mutation',()=>fixture((d,r)=>{
 const json=JSON.stringify(r).replace('"version":1','"version":1,"version":1');
 const p=join(d,'request.json');writeFileSync(p,json);
 const helper=new URL('./windows-operation-lock.ps1',import.meta.url);
 const result=spawnSync('powershell.exe',['-NoProfile','-File',helper.pathname.replace(/^\/(\w:)/,'$1')],{input:json,encoding:'utf8'});assert.equal(result.status,1);assert.deepEqual(JSON.parse(result.stdout),{status:'refused'});
 assert.equal(readdirSync(d).includes('.nexus-production-locks'),false);
}));
