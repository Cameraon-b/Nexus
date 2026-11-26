import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,renameSync,readdirSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {privateCustody,operationCandidate,removeFixture as rmSync} from './fixtures/operation-candidate.mjs';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {acquireOperationLock} from './production-operations.mjs';
import {testBinding as operationLockRoot} from './fixtures/operation-candidate.mjs';
const outcomes=await import('./production-operation-outcome.mjs').catch(()=>({}));
async function fixture(fn){const d=mkdtempSync(join(tmpdir(),'nexus-r10-'));try{if(process.platform==='win32'){const user=spawnSync('whoami.exe',[],{encoding:'utf8'}).stdout.trim();assert.equal(spawnSync('icacls.exe',[d,'/inheritance:r','/grant:r',`${user}:(OI)(CI)F`],{encoding:'utf8'}).status,0);}await fn(d);}finally{rmSync(d,{recursive:true,force:true});}}
function setup(d){const a=join(d,'tools','candidates','a'),b=join(d,'tools','candidates','b');mkdirSync(a,{recursive:true});mkdirSync(b);const configs=['one','two'].map(n=>{const p=join(d,n);mkdirSync(p);writeFileSync(join(p,'config'),'{}');return join(p,'config');});return {a,b,configs};}
test('round10: alternate config parents and candidate versions serialize by project in bound custody',()=>fixture(async d=>{const {a,b,configs}=setup(d);const x=operationLockRoot(configs[0],a),y=operationLockRoot(configs[1],b);const release=await acquireOperationLock('nexus_prod_shared',configs[0],x);try{await assert.rejects(async()=>acquireOperationLock('nexus_prod_shared',configs[1],y),{code:'NEXUS_OPERATION_LOCKED'});await (await acquireOperationLock('nexus_prod_other',configs[1],y))();}finally{await release();}}));
for(const swap of ['rename','junction'])test('round10: '+swap+' after binding refuses and never writes redirected target',()=>fixture(d=>{const {a,configs}=setup(d),binding=operationLockRoot(configs[0],a);const target=join(d,'target');mkdirSync(target);renameSync(join(d,'one'),join(d,'old'));if(swap==='rename'){mkdirSync(join(d,'one'));writeFileSync(configs[0],'{}');}else symlinkSync(target,join(d,'one'),'junction');assert.throws(()=>acquireOperationLock('nexus_prod_shared',configs[0],binding));assert.deepEqual(readdirSync(target),[]);}));
test('round10: unbound candidates and configs fail closed',()=>fixture(d=>{const {a,configs}=setup(d);assert.throws(()=>operationLockRoot(configs[0],join(d,'unbound')));const outside=join(tmpdir(),'outside-nexus-config');assert.throws(()=>operationLockRoot(outside,a));}));
test('round10: Windows existing Everyone full-control lock root refuses', {skip:process.platform!=='win32'},()=>fixture(async d=>{const {a,configs}=setup(d),locks=join(d,'.nexus-production-locks');mkdirSync(locks);assert.equal(spawnSync('icacls.exe',[locks,'/grant','*S-1-1-0:(OI)(CI)F'],{encoding:'utf8'}).status,0);await assert.rejects(async()=>acquireOperationLock('nexus_prod_shared',configs[0],operationLockRoot(configs[0],a)));}));
for(const part of ['custody','lock-root'])for(const kind of ['recreate','junction'])test('round10: '+part+' '+kind+' between validation and child creation refuses',()=>fixture(async d=>{
 const c=join(d,'custody');mkdirSync(c);privateCustody(c);const {a,configs}=setup(c);
 await (await acquireOperationLock('nexus_prod_seed',configs[0],operationLockRoot(configs[0],a)))();
 const binding=operationLockRoot(configs[0],a),target=join(d,'redirect');mkdirSync(target);
 const source=part==='custody'?c:binding.directory;
 await assert.rejects(async()=>acquireOperationLock('nexus_prod_swap',configs[0],binding,{beforeCreate(){renameSync(source,source+'-original');if(kind==='junction')symlinkSync(target,source,'junction');else mkdirSync(source);}}));
 assert.deepEqual(readdirSync(target),[]);
}));
test('round10: exact private lock root remains private and lifetime handles prevent replacement owners',()=>fixture(async d=>{
 const {a,configs}=setup(d),binding=operationLockRoot(configs[0],a);
 const release=await acquireOperationLock('nexus_prod_owner',configs[0],binding);
 const locks=binding.directory,path=join(locks,readdirSync(locks)[0]);
 const acl=spawnSync('icacls.exe',[locks],{encoding:'utf8'}).stdout;assert.ok(acl.length>0);
 try{
  await assert.rejects(async()=>acquireOperationLock('nexus_prod_owner',configs[1],operationLockRoot(configs[1],a)),{code:'NEXUS_OPERATION_LOCKED'});
  assert.throws(()=>renameSync(path,path+'-old'));
  await (await acquireOperationLock('nexus_prod_independent',configs[1],operationLockRoot(configs[1],a)))();
  assert.equal(spawnSync('icacls.exe',[locks],{encoding:'utf8'}).stdout,acl);
 }finally{await release();}
}));
test('round10: validated acquisition cannot be redirected by replacing the helper pathname',()=>fixture(d=>{
 const {root}=operationCandidate(d),config=join(d,'config');writeFileSync(config,'{}');const marker=join(d,'redirected');
 const helper=join(root,'scripts','windows-operation-lock.ps1');
 const source=`import {writeFileSync,existsSync} from 'node:fs';import {operationLockRoot,acquireOperationLock} from ${JSON.stringify(pathToFileURL(join(root,'scripts','production-operations.mjs')).href)};const config=${JSON.stringify(config)},root=${JSON.stringify(root)};const binding=operationLockRoot(config,root,{custodyRoot:${JSON.stringify(d)}});const release=await acquireOperationLock('nexus_prod_helper',config,binding,{beforeCreate(){try{writeFileSync(${JSON.stringify(helper)},${JSON.stringify("[IO.File]::WriteAllText('"+marker.replaceAll("'","''")+"','redirected')\nexit 1")});throw Error('immutable helper unexpectedly writable');}catch(e){if(!['EPERM','EACCES'].includes(e.code))throw e;}}});await release();`;
 const r=spawnSync(process.execPath,['--input-type=module','-e',source],{encoding:'utf8'});
 assert.equal(readdirSync(d).includes('redirected'),false,'replacement helper was executed');assert.equal(r.status,0,r.stderr);
}));
test('round10: unsupported platforms refuse without a pathname-only fallback',()=>fixture(d=>{
 const {a,configs}=setup(d),binding=operationLockRoot(configs[0],a),platform=Object.getOwnPropertyDescriptor(process,'platform');
 try{Object.defineProperty(process,'platform',{value:'linux'});assert.throws(()=>acquireOperationLock('nexus_prod_unsupported',configs[0],binding));assert.equal(readdirSync(d).includes('.nexus-production-locks'),false);}finally{Object.defineProperty(process,'platform',platform);}
}));
for(const code of ['NEXUS_BACKUP_AVAILABILITY','NEXUS_RESTORE_CLEANUP','GENERIC',null])test('round10: operation '+code+' plus release failure preserves priorities and redacts diagnostics',()=>{const primary=code?Object.assign(Error('private-path external-stderr'),{code}):undefined;const cleanup=Object.assign(Error('private cleanup'),{code:'NEXUS_OPERATION_LOCK_CLEANUP'});let error;try{outcomes.finishOperation(primary,()=>{throw cleanup;});}catch(e){error=e;}assert.ok(error);const lines=outcomes.operationFailureLines(error);assert.equal(lines.length,code?2:1);assert.match(lines.at(-1),/NEXUS_OPERATION_LOCK_CLEANUP/);if(code?.startsWith('NEXUS_'))assert.match(lines[0],new RegExp(code));assert.doesNotMatch(lines.join('\n'),/private-path|external-stderr|private cleanup|verified successfully/);});
