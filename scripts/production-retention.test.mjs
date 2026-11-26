import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,closeSync,existsSync,symlinkSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn as realSpawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {artifactNames,readBoundedSnapshot} from './production-envelope.mjs';
import {retireQuartet,invokeRetentionHelper} from './production-retention.mjs';
import {hash} from './production-recovery.mjs';
async function fixture(fn){const d=mkdtempSync(join(tmpdir(),'nexus-r7-retire-')),descriptors={};try{const members=Object.fromEntries(Object.values(artifactNames('2024-01-01T00:00:00Z')).map(name=>{writeFileSync(join(d,name),'approved');const s=readBoundedSnapshot(join(d,name),100,{holdDescriptor:true});descriptors[name]=s.fd;return [name,{name,length:8,sha256:hash('approved'),identity:s.identity,device:s.device,inode:s.inode}];}));await fn(d,members,descriptors);}finally{for(const fd of Object.values(descriptors))closeSync(fd);rmSync(d,{recursive:true,force:true});}}
for(const fault of ['exit','timeout','malformed','oversized','stderr'])test('round7: bounded helper '+fault+' refuses',async()=>{
 let killed=false;
 await assert.rejects(()=>invokeRetentionHelper({}, {deadlineMs:20,spawn:(exe,args,o)=>{
  assert.equal(exe,'powershell.exe');assert.equal(o.shell,false);assert.equal(args.at(-2),'-File');
  const c=new EventEmitter();c.stdout=new PassThrough();c.stderr=new PassThrough();c.stdin=new PassThrough();c.kill=()=>{killed=true;};
  queueMicrotask(()=>{if(fault==='timeout')return;if(fault==='stderr')c.stderr.write('private');c.stdout.end(fault==='oversized'?'x'.repeat(129):fault==='malformed'?'OK':'NEXUS_RETENTION_OK\r\n');c.emit('close',fault==='exit'?1:0);});return c;
 }}),e=>e.code==='NEXUS_RETENTION_CLEANUP');assert.equal(killed,true);
});
for(const race of ['before-open','after-completion'])test('round7: public replacement '+race+' is preserved',()=>fixture(async(d,members,descriptors)=>{
 const p=join(d,Object.keys(members)[0]);
 await assert.rejects(()=>retireQuartet(d,members,{descriptors,spawn:(...args)=>{
  if(race==='before-open')writeFileSync(p,'replaced');
  const c=realSpawn(...args);if(race==='after-completion')c.prependListener('close',code=>{assert.equal(code,0);writeFileSync(p,'replacement after completion');});return c;
 }}),e=>e.code==='NEXUS_RETENTION_CLEANUP');
 assert.equal(readFileSync(p,'utf8'),race==='before-open'?'replaced':'replacement after completion');
 if(race==='before-open')for(const name of Object.keys(members).slice(1))assert.equal(readFileSync(join(d,name),'utf8'),'approved');
}));
test('round7: descriptor identity drift refuses before spawn',()=>fixture(async(d,members,descriptors)=>{
 writeFileSync(join(d,Object.keys(members)[0]),'longer changed bytes');let called=false;
 await assert.rejects(()=>retireQuartet(d,members,{descriptors,spawn:()=>{called=true;}}));assert.equal(called,false);
}));
test('round7: real incompatible open prevents all deletion',()=>fixture(async(d,members,descriptors)=>{
 const p=join(d,Object.keys(members)[3]);
 const holder=realSpawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',"$f=[IO.File]::Open($env:NEXUS_TEST_HELD,'Open','Read','Read'); [Console]::Out.WriteLine('READY'); [Console]::In.ReadLine() | Out-Null; $f.Dispose()"],{env:{...process.env,NEXUS_TEST_HELD:p},stdio:['pipe','pipe','pipe'],shell:false});
 try{await new Promise((resolve,reject)=>{holder.stdout.once('data',b=>b.toString().trim()==='READY'?resolve():reject(Error('holder')));holder.once('error',reject);holder.once('exit',()=>reject(Error('holder exit')));});
 await assert.rejects(()=>retireQuartet(d,members,{descriptors}));for(const name of Object.keys(members))assert.equal(readFileSync(join(d,name),'utf8'),'approved');
 }finally{holder.stdin.end('\n');await new Promise(resolve=>holder.once('close',resolve));}
}));
test('round7: reparse directory member refuses all deletion',()=>fixture(async(d,members,descriptors)=>{
 for(const name of Object.keys(descriptors)){closeSync(descriptors[name]);delete descriptors[name];}
 const name=Object.keys(members)[3],target=join(d,'target');rmSync(join(d,name));mkdirSync(target);symlinkSync(target,join(d,name),'junction');
 const request={version:1,directory:d,members:Object.values(members).map(({name,length,sha256,device,inode})=>({name,length,sha256,device,inode}))};await assert.rejects(()=>invokeRetentionHelper(request));for(const n of Object.keys(members).slice(0,3))assert.equal(existsSync(join(d,n)),true);
}));
test('round7: non-Windows refuses rather than falling back to path deletion',()=>fixture(async(d,members,descriptors)=>{
 const platform=Object.getOwnPropertyDescriptor(process,'platform');let called=false;
 try{Object.defineProperty(process,'platform',{value:'linux'});await assert.rejects(()=>retireQuartet(d,members,{descriptors,spawn:()=>{called=true;}}));assert.equal(called,false);for(const name of Object.keys(members))assert.equal(existsSync(join(d,name)),true);}finally{Object.defineProperty(process,'platform',platform);}
}));
test('round7: retention source has no pathname deletion or quarantine creation',()=>{
 const node=readFileSync(new URL('./production-retention.mjs',import.meta.url),'utf8'),ps=readFileSync(new URL('./windows-retire-quartet.ps1',import.meta.url),'utf8');
 for(const source of [node,ps])assert.doesNotMatch(source,/Remove-Item|\b(?:unlink|rm|rename|mkdir)(?:Sync)?\s*\(|recursive\s*:|console\.(?:log|error)/i);
 assert.match(node,/process\.platform!=='win32'/);assert.match(node,/shell:false/);assert.match(ps,/0x80010000,1,IntPtr.Zero,3,0x08200000/);assert.match(ps,/SetFileInformationByHandle\(handle,4/);
});
