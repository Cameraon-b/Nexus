import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {acquireDirectoryLock} from './production-directory-lock.mjs';
import {acquireOperationLock} from './production-operations.mjs';
import * as pull from './pull-production-backup.mjs';
test('round5: operation replacement before release fails without deleting new token/directory',()=>{
 const d=mkdtempSync(join(tmpdir(),'nexus-r5-'));const config=join(d,'config');writeFileSync(config,'');
 try{const release=acquireOperationLock('nexus_prod_r5',config,d);const lock=join(d,readdirSync(d).find(n=>n.endsWith('.lock')));rmSync(lock,{recursive:true});mkdirSync(lock);writeFileSync(join(lock,'replacement'),'new');assert.throws(release,e=>e.code==='NEXUS_OPERATION_LOCK_CLEANUP');assert.ok(existsSync(join(lock,'replacement')));}finally{rmSync(d,{recursive:true,force:true});}
});
test('round5: completed operation release cannot remove subsequent acquisition or unrelated lock',()=>{
 const d=mkdtempSync(join(tmpdir(),'nexus-r5-'));const config=join(d,'config');writeFileSync(config,'');
 try{const old=acquireOperationLock('nexus_prod_r5',config,d);const other=acquireOperationLock('nexus_prod_other',config,d);old();const next=acquireOperationLock('nexus_prod_r5',config,d);old();assert.equal(readdirSync(d).filter(n=>n.endsWith('.lock')).length,2);next();other();}finally{rmSync(d,{recursive:true,force:true});}
});
for(const fault of ['noop','throw'])test('round5: token unlink '+fault+' fails closed without directory removal',()=>{
 const d=mkdtempSync(join(tmpdir(),'nexus-r5-token-')),lock=join(d,'lock');let removed=false;
 try{const release=acquireDirectoryLock(lock,{cleanupCode:'SAFE',unlink:()=>{if(fault==='throw')throw Error('private');},remove:()=>{removed=true;}});const names=readdirSync(lock);assert.equal(names.length,1);assert.match(names[0],/^owner-[a-f0-9]{64}\.json$/);assert.throws(release,e=>e.code==='SAFE');assert.equal(removed,false);assert.deepEqual(readdirSync(lock),names);}finally{rmSync(d,{recursive:true,force:true});}
});
function spawner(chunks,{code=0,hang=false}={}){let killed=false;return {get killed(){return killed;},spawn(exe,args,options){assert.equal(exe,'ssh');assert.equal(options.shell,false);const c=new EventEmitter();c.stdout=new PassThrough();c.stderr=new PassThrough();c.kill=()=>{killed=true;queueMicrotask(()=>c.emit('close',null));};queueMicrotask(()=>{for(const b of chunks)c.stdout.write(b);if(!hang){c.stdout.end();c.emit('close',code);}});return c;}};}
for(const extra of [0,1])test('round5: bounded listing exact cap '+(extra?'+1':'')+' before decode',async()=>{
 assert.equal(typeof pull.listingByteCap,'number');const fake=spawner([Buffer.alloc(pull.listingByteCap),...(extra?[Buffer.from('x')]:[])]);const task=()=>pull.listBounded([],{spawn:fake.spawn});if(extra){await assert.rejects(task);assert.equal(fake.killed,true);}else assert.equal((await task()).length,pull.listingByteCap);
});
test('round5: listing nonzero and deadline kill/refusal',async()=>{
 assert.equal(typeof pull.listBounded,'function');for(const opts of [{code:1},{hang:true}]){const fake=spawner([Buffer.from('x')],opts);await assert.rejects(()=>pull.listBounded([],{spawn:fake.spawn,deadlineMs:10}));assert.equal(fake.killed,true);}
});
