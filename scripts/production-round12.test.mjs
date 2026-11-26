import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {readFileSync} from 'node:fs';
import {parseLifecycleOptions} from './production-lifecycle-options.mjs';
import {residentLock} from './production-resident-lock.mjs';
for(const command of ['validate','build','migrate','start','status','stop','destroy','recover-operation-lock'])test('round12 closed lifecycle '+command,()=>{
 const base=['--project','nexus_prod_test','--config-file','private'];
 if(command==='destroy')base.push('--confirm-destroy','nexus_prod_test');
 if(command==='recover-operation-lock')base.push('--confirm-recover-lock','nexus_prod_test');
 assert.equal(parseLifecycleOptions(command,base).project,'nexus_prod_test');
 for(const tail of [['--unknown','x'],['--project','again'],['--config-file'],['--allow-dirty','yes'],['--confirm-destroy','other']])assert.throws(()=>parseLifecycleOptions(command,[...base,...tail]));
 if(command==='build')assert.equal(parseLifecycleOptions(command,[...base,'--allow-dirty']).allowDirty,true);
 else assert.throws(()=>parseLifecycleOptions(command,[...base,'--allow-dirty']));
 assert.throws(()=>parseLifecycleOptions(command,['--project','--config-file','private']));
 assert.throws(()=>parseLifecycleOptions(command,[...base,'--allow-dirty','--allow-dirty']));
 assert.throws(()=>parseLifecycleOptions(command,['--project','nexus_prod_test','--config-file','-x',...base.slice(4)]));
 if(['destroy','recover-operation-lock'].includes(command))assert.throws(()=>parseLifecycleOptions(command,[...base.slice(0,-1),'other']));
});
test('round12 recovery includes disposable restore identities without broadening lifecycle',()=>{
 const args=['--project','nexus_s10_restore_test','--config-file','private'];
 assert.equal(parseLifecycleOptions('recover-operation-lock',[...args,'--confirm-recover-lock','nexus_s10_restore_test']).project,'nexus_s10_restore_test');
 assert.throws(()=>parseLifecycleOptions('stop',args));
});
function fake(mode){
 const c=new EventEmitter();c.pid=process.pid;c.stdout=new PassThrough();c.stderr=new PassThrough();c.stdin=new PassThrough();c.kill=()=>{c.emit('close',null,'SIGTERM');};
 c.stdin.on('data',b=>{if(b.toString()==='request\n')queueMicrotask(()=>c.stdout.write('{"status":"acquired"}\n'));else queueMicrotask(()=>{
  c.emit('exit',mode==='nonzero'?1:0,null);
  setTimeout(()=>{if(mode==='stderr')c.stderr.write('bad');c.stdout.end(mode==='malformed'?'{}\n':mode==='trailing'?'{"status":"released"}\nextra':'{"status":"released"}\n');c.stderr.end();c.emit('close',mode==='nonzero'?1:0,null);},5);
 });});return c;
}
for(const mode of ['valid','malformed','trailing','stderr','nonzero'])test('round12 resident close ordering '+mode,async()=>{
 const release=await residentLock(fake(mode),'request\n',{timeout:100});
 if(mode==='valid')await release();else await assert.rejects(release());
});
test('round12 resident timeout and helper death never report release success',async()=>{
 for(const kind of ['timeout','death']){
  const c=new EventEmitter();c.pid=process.pid;c.stdout=new PassThrough();c.stderr=new PassThrough();c.stdin=new PassThrough();c.kill=()=>{};
  c.stdin.once('data',()=>queueMicrotask(()=>c.stdout.write('{"status":"acquired"}\n')));
  const release=await residentLock(c,'request\n',{timeout:20});
  if(kind==='death'){c.emit('exit',1,null);c.stdout.end();c.emit('close',1,null);}
  await assert.rejects(release());
 }
});
test('round12 recovery requires clean close even after exact success response',async()=>{
 for(const tail of ['{"status":"cleanup"}\n','extra']){
  const c=new EventEmitter();c.stdout=new PassThrough();c.stderr=new PassThrough();c.stdin=new PassThrough();c.kill=()=>{};
  c.stdin.on('data',()=>queueMicrotask(()=>{c.stdout.write('{"status":"recovered"}\n');setTimeout(()=>{c.stdout.end(tail);c.emit('close',0,null);},5);}));
  await assert.rejects(residentLock(c,'request\n',{timeout:50,recovery:true}));
 }
});
test('round12 systemd installed layout and pinned interpreter',()=>{
 const service=readFileSync('deployment/nexus-backup.service.example','utf8');
 assert.match(service,/\/srv\/nexus\/shared\/tools\/candidates\/[a-f0-9]{64}\//);
 assert.match(service,/Environment=PATH=\/usr\/bin:\/bin/);
 assert.match(service,/RefuseManualStop=yes/);
 assert.match(readFileSync('scripts/production-posix-lock.mjs','utf8'),/spawn\('\/usr\/bin\/python3'/);
 const timer=readFileSync('deployment/nexus-backup.timer.example','utf8');
 for(const line of ['OnCalendar=*-*-* 08:15:00 UTC','RandomizedDelaySec=10m','Persistent=true'])assert.ok(timer.includes(line));
});
