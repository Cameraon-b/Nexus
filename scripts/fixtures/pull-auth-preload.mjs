// Synthetic SSH observer only; never connects to any host.
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
const nativeSpawn=cp.spawn;
cp.spawn=(exe,...args)=>{
 if(exe!=='ssh')return nativeSpawn(exe,...args);
 console.log('NEXUS_TEST_SSH_CALLED');
 const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};
 queueMicrotask(()=>{child.stdout.end('');child.emit('close',0);});return child;
};
syncBuiltinESMExports();
