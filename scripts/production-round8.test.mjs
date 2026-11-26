import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,fstatSync,closeSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {artifactNames,readBoundedSnapshot} from './production-envelope.mjs';
import {validWindowsIdentity,invokeRetentionHelper} from './production-retention.mjs';
const source=readFileSync(new URL('./windows-retire-quartet.ps1',import.meta.url),'utf8').split("-TypeDefinition @'\n")[1].split("\n'@ | Out-Null")[0];
function fixture(fn){const directory=mkdtempSync(join(tmpdir(),'nexus-r8-'));try{return fn(directory);}finally{rmSync(directory,{recursive:true,force:true});}}
function compiled(directory,code,body){const script=join(directory,'test.ps1');writeFileSync(script,"$ErrorActionPreference='Stop'\nAdd-Type -ReferencedAssemblies System.Web.Extensions -TypeDefinition @'\n"+code+"\n'@\n"+body);const r=spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-File',script],{encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
const quote=s=>"'"+s.replaceAll("'","''")+"'";
function request(directory){return {version:1,directory,members:Object.values(artifactNames('2024-01-01T00:00:00Z')).map(name=>{writeFileSync(join(directory,name),'approved');const s=readBoundedSnapshot(join(directory,name),100);return {name,length:8,sha256:createHash('sha256').update('approved').digest('hex'),device:s.device,inode:s.inode};})};}
test('round8: held BigInt Node descriptor maps exactly to Windows volume and full file index',t=>fixture(directory=>{
 const path=join(directory,'identity');writeFileSync(path,'identity');const s=readBoundedSnapshot(path,100,{holdDescriptor:true});
 try{const st=fstatSync(s.fd,{bigint:true});const query=`public static string Query(string path) {
 using(var h=CreateFileW(path,0x80000000,7,IntPtr.Zero,3,0x00200000,IntPtr.Zero)) {
 Info info=new Info(); Require(!h.IsInvalid && GetFileInformationByHandle(h,out info));
 return info.Volume.ToString(System.Globalization.CultureInfo.InvariantCulture)+":"+(((ulong)info.IndexHigh<<32)|info.IndexLow).ToString(System.Globalization.CultureInfo.InvariantCulture);
 }}\n`;
 const actual=compiled(directory,source.replace('    static void Require(bool value)',query+'    static void Require(bool value)'),`[NexusHandleRetirement]::Query(${quote(path)})`);
 assert.equal(actual,st.dev.toString()+':'+st.ino.toString());assert.equal(s.device,st.dev.toString());assert.equal(s.inode,st.ino.toString());t.diagnostic('Exact held descriptor Node dev:ino = Win32 volume:file-index = '+actual);
 }finally{closeSync(s.fd);}
}));
for(const bits of [32,64])test('round8: strict unsigned decimal '+bits,()=>{
 for(const value of ['', '00','01','-1','+1',' 1','1 ','1\n','1.0','1e2','١',1,null,(1n<<BigInt(bits)).toString()])assert.equal(validWindowsIdentity(value,bits),false,String(value));
 for(const value of ['0','1',((1n<<BigInt(bits))-1n).toString()])assert.equal(validWindowsIdentity(value,bits),true);
});
for(const fault of ['wrong-device','wrong-inode','device-overflow','inode-overflow','leading-zero','sign','space','newline','number','missing'])test('round8: closed helper identity refuses '+fault,async()=>{
 const directory=mkdtempSync(join(tmpdir(),'nexus-r8-schema-'));try{const r=request(directory),m=r.members[3];
 if(fault==='wrong-device')m.device=(BigInt(m.device)^1n).toString();if(fault==='wrong-inode')m.inode=(BigInt(m.inode)^1n).toString();
 if(fault==='device-overflow')m.device='4294967296';if(fault==='inode-overflow')m.inode='18446744073709551616';if(fault==='leading-zero')m.inode='0'+m.inode;
 if(fault==='sign')m.inode='+'+m.inode;if(fault==='space')m.device+=' ';if(fault==='newline')m.inode+='\n';if(fault==='number')m.inode=1;if(fault==='missing')delete m.device;
 await assert.rejects(()=>invokeRetentionHelper(r),e=>e.code==='NEXUS_RETENTION_CLEANUP');for(const m of r.members)assert.equal(existsSync(join(directory,m.name)),true);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
for(const rollbackFails of [false,true])test('round8: later disposition failure rolls back best effort; rollback failure still refuses '+rollbackFails,()=>fixture(directory=>{
 const r=request(directory);const body=`[NexusHandleRetirement]::FailDispositionAt=2\n[NexusHandleRetirement]::FailRollbackAt=${rollbackFails?0:-1}\n[NexusHandleRetirement]::Run(${quote(JSON.stringify(r))})\n[NexusHandleRetirement]::RollbackAttempts`;
 assert.equal(compiled(directory,'#define NEXUS_RETIREMENT_TEST\n'+source,body),'False\r\n2');
 for(let i=0;i<4;i++)assert.equal(existsSync(join(directory,r.members[i].name)),!(rollbackFails&&i===0));
}));
test('round8: normal compiled helper has no disposition fault controls',()=>fixture(directory=>{
 assert.equal(compiled(directory,source,"[NexusHandleRetirement].GetField('FailDispositionAt') -eq $null"),'True');
}));
