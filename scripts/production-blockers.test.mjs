import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PassThrough} from 'node:stream';
import {EventEmitter} from 'node:events';
import {spawnSync} from 'node:child_process';
import * as envelope from './production-envelope.mjs';
import * as pull from './pull-production-backup.mjs';
test('blocker: explicit auxiliary limits enforce exact and over-limit reads',()=>{
 for(const [kind,cap] of [['sidecar',256],['metadata',16384],['signature',4096]]){
  assert.equal(envelope.quartetLimits?.[kind],cap);
  const d=mkdtempSync(join(tmpdir(),'nexus_limits_'));try{const p=join(d,kind);writeFileSync(p,Buffer.alloc(cap));assert.equal(envelope.readBoundedFile(p,cap).length,cap);writeFileSync(p,Buffer.alloc(cap+1));assert.throws(()=>envelope.readBoundedFile(p,cap));}finally{rmSync(d,{recursive:true,force:true});}
 }
});
test('blocker: SSH streaming aborts and unlinks at cap, without remote stat/SCP',async()=>{
 assert.equal(typeof pull.transferBounded,'function');
 const d=mkdtempSync(join(tmpdir(),'nexus_stream_'));try{
  for(const cap of [256,4096,16384,envelope.maxCiphertextBytes]){
   for(const over of [false,true]){
    const p=join(d,'staged');let killed=false;
    const spawn=(exe,args,options)=>{assert.equal(exe,'ssh');assert.equal(options.shell,false);assert.ok(args.includes('StrictHostKeyChecking=yes'));const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{killed=true;child.stdout.destroy();queueMicrotask(()=>child.emit('close',null));};
     queueMicrotask(async()=>{try{let remaining=cap+(over?1:0);const chunk=Buffer.alloc(Math.min(cap,1024*1024));while(remaining>0&&!killed){const b=chunk.subarray(0,Math.min(chunk.length,remaining));remaining-=b.length;if(!child.stdout.write(b))await new Promise(r=>child.stdout.once('drain',r));}if(!killed){child.stdout.end();child.emit('close',0);}}catch{}});return child;};
    const op=()=>pull.transferBounded(['-o','StrictHostKeyChecking=yes','backup@invalid','cat','--','/private/exact'],p,cap,{spawn});
    if(over){await assert.rejects(op);assert.ok(killed);assert.equal(existsSync(p),false);}else{await op();assert.equal(readFileSync(p).length,cap);rmSync(p);}
   }
  }
 }finally{rmSync(d,{recursive:true,force:true});}
});
test('blocker: image probes have no silent stale fallback',()=>{
 const s=readFileSync(new URL('./production-image.test.mjs',import.meta.url),'utf8');assert.ok(!s.includes('bd054b4a'));assert.match(s,/909cadc9edf6ff8484b8859b0f17ac9b0184a1c0/);assert.match(s,/NEXUS_COMMIT/);
 for(const target of [undefined,'0'.repeat(40)]){const env={...process.env};delete env.NEXUS_COMMIT;delete env.NODE_TEST_CONTEXT;if(target)env.NEXUS_COMMIT=target;const r=spawnSync(process.execPath,['--test','scripts/production-image.test.mjs'],{env,encoding:'utf8',timeout:10000});assert.notEqual(r.status,0);assert.match(r.stdout+r.stderr,/require explicit NEXUS_COMMIT=909cadc9edf6ff8484b8859b0f17ac9b0184a1c0/);}
 const docs=readFileSync(new URL('../deployment/README.md',import.meta.url),'utf8');assert.ok(docs.includes('NEXUS_COMMIT=909cadc9edf6ff8484b8859b0f17ac9b0184a1c0 node --test scripts/production*.test.mjs'));
});
