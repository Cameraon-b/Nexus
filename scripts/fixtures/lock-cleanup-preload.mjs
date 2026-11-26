// Subprocess-only fault injection: never imported by production tooling.
import fs from 'node:fs';
import cp from 'node:child_process';
import {syncBuiltinESMExports,registerHooks} from 'node:module';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
const original=fs.rmdirSync;
fs.rmdirSync=(path,options)=>{
 if(String(path).endsWith('.lock')){
  if(process.env.NEXUS_TEST_LOCK_FAULT==='throw')throw Error('private-path-config-token');
  if(process.env.NEXUS_TEST_LOCK_FAULT==='noop')return;
 }
 return original(path,options);
};
const nativeSpawn=cp.spawn;
cp.spawn=(exe,...args)=>{if(exe!=='ssh')return nativeSpawn(exe,...args);const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};queueMicrotask(()=>{child.stdout.end(fs.readdirSync(process.env.NEXUS_TEST_DEST??'.').filter(n=>!n.startsWith('.')).join('\n'));child.emit('close',0);});return child;};
const nativeSpawnSync=cp.spawnSync;
cp.spawnSync=(exe,...args)=>['powershell.exe','python3'].includes(exe)?nativeSpawnSync(exe,...args):({status:0,stdout:fs.readdirSync(process.env.NEXUS_TEST_DEST??'.').filter(n=>!n.startsWith('.')).join('\n')});
syncBuiltinESMExports();
globalThis.fetch=async()=>{console.log('TEST_NOTIFICATION');return {ok:true};};
if(process.env.NEXUS_TEST_RECOVERY)registerHooks({load(url,context,next){
 // Explicit legacy primitive seam for release-fault tests, not custody proof.
 if(url.endsWith('/production-operations.mjs')){const source=fs.readFileSync(new URL(url),'utf8').replace('return bindOperationCustody(config,root,options);',"return join(dirname(config),'.nexus-production-locks');");return {format:'module',shortCircuit:true,source};}
 if(url.endsWith('/production-backup.mjs'))return {format:'module',shortCircuit:true,source:`
 export function parseRecoveryOptions(command,args){return {project:args[args.indexOf('--project')+1],env:args[args.indexOf('--env-file')+1],restoreConfig:args[args.indexOf('--restore-config')+1]};}
 export function backup(){if(process.env.NEXUS_TEST_OPERATION_ERROR)throw Object.assign(Error('private-path-config-token'),{code:process.env.NEXUS_TEST_OPERATION_ERROR});}
 export const restoreVerify=backup;
 export function execute(){throw Error('Unexpected external step');}
 `};
 return next(url,context);
}});
