import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,lstatSync,existsSync,readdirSync,rmSync,rmdirSync,linkSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {acquireDirectoryLock} from './production-directory-lock.mjs';
import {publish} from './production-backup.mjs';
test('round6: publication source-unlink failure never unlinks substituted public file',()=>fixture(d=>{
 const source=join(d,'source'),target=join(d,'target');writeFileSync(source,'approved');let calls=0;
 assert.throws(()=>publish(source,target,{unlink:p=>{calls++;if(p===source){unlinkSync(target);writeFileSync(target,'replacement');throw Error('source unlink');}unlinkSync(p);}}),e=>e.code==='NEXUS_PUBLICATION_CLEANUP');assert.equal(calls,1);assert.ok(existsSync(target));
}));
const fixture=fn=>{const d=mkdtempSync(join(tmpdir(),'nexus-r6-'));try{return fn(d,join(d,'lock'));}finally{rmSync(d,{recursive:true,force:true});}};
test('round6: actual old release rmdir interleaves with new provisional setup',()=>fixture((d,p)=>{
 let next;const old=acquireDirectoryLock(p,{cleanupCode:'CLEAN',remove:()=>{
  rmdirSync(p);let first=true;
  next=acquireDirectoryLock(p,{cleanupCode:'CLEAN',write:(...a)=>{if(first){first=false;rmdirSync(p);}writeFileSync(...a);}});
 }});
 assert.throws(old,e=>e.code==='CLEAN');assert.equal(readdirSync(p).length,1);next();assert.equal(existsSync(p),false);
}));
test('round6: bounded diagnostics failure precedes mkdir',()=>fixture((d,p)=>{
 assert.throws(()=>acquireDirectoryLock(p,{diagnostics:{config:{toString(){throw Error('diagnostics');}}}}));assert.equal(existsSync(p),false);
}));
test('round6: token identity setup fault returns dedicated uncertainty and preserves evidence',()=>fixture((d,p)=>{
 assert.throws(()=>acquireDirectoryLock(p,{stat:path=>{if(path!==p)throw Error('token stat');return lstatSync(path);},cleanupCode:'CLEAN'}),e=>e.code==='CLEAN');assert.equal(readdirSync(p).length,1);
}));
test('round6: entropy failure precedes fixed mkdir',()=>fixture((d,p)=>{
 assert.throws(()=>acquireDirectoryLock(p,{entropy:()=>{throw Error('entropy');}}));assert.equal(existsSync(p),false);
}));
test('round6: lstat failure after mkdir cleans empty provisional',()=>fixture((d,p)=>{
 let first=true;assert.throws(()=>acquireDirectoryLock(p,{stat:(...a)=>{if(first){first=false;throw Error('stat');}return lstatSync(...a);},cleanupCode:'CLEAN'}));assert.equal(existsSync(p),false);
}));
test('round6: uncertain provisional cleanup returns dedicated error',()=>fixture((d,p)=>{
 assert.throws(()=>acquireDirectoryLock(p,{stat:()=>{throw Error('stat');},remove:()=>{},cleanupCode:'CLEAN'}),e=>e.code==='CLEAN');assert.ok(existsSync(p));
}));
test('round6: old release removes new provisional before token write; new owner retries',()=>fixture((d,p)=>{
 let first=true;const release=acquireDirectoryLock(p,{write:(...a)=>{if(first){first=false;rmdirSync(p);}writeFileSync(...a);},cleanupCode:'CLEAN'});
 assert.equal(first,false);assert.equal(readdirSync(p).length,1);release();assert.equal(existsSync(p),false);
}));
test('round6: populated replacement is never removed or stolen',()=>fixture((d,p)=>{
 assert.throws(()=>acquireDirectoryLock(p,{write:(...a)=>{rmdirSync(p);mkdirSync(p);writeFileSync(join(p,'replacement'),'owner');const e=Error();e.code='ENOENT';throw e;},cleanupCode:'CLEAN',lockedCode:'LOCKED'}));assert.deepEqual(readdirSync(p),['replacement']);
}));
test('round6: provisional loss retry is bounded and leaves no ownerless lock',()=>fixture((d,p)=>{
 let calls=0;assert.throws(()=>acquireDirectoryLock(p,{attempts:3,write:()=>{calls++;rmdirSync(p);const e=Error();e.code='ENOENT';throw e;},cleanupCode:'CLEAN'}));assert.equal(calls,3);assert.equal(existsSync(p),false);
}));
test('round6: publication source-unlink failure preserves substituted public directory',()=>fixture(d=>{
 const source=join(d,'source'),target=join(d,'target');writeFileSync(source,'approved');
 assert.throws(()=>publish(source,target,{unlink:()=>{unlinkSync(target);mkdirSync(target);writeFileSync(join(target,'evidence'),'replacement');throw Error('source unlink');}}),e=>e.code==='NEXUS_PUBLICATION_CLEANUP');assert.ok(existsSync(join(target,'evidence')));
}));
