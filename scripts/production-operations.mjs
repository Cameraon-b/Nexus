import {mkdirSync,realpathSync,lstatSync,statSync,readFileSync,rmdirSync} from 'node:fs';
import {bindOperationCustody,acquireCustodyLock} from './production-lock-custody.mjs';
import {acquireDirectoryLock} from './production-directory-lock.mjs';
import {createHash} from 'node:crypto';
import {join,dirname,isAbsolute,relative,resolve,sep} from 'node:path';
export function validateSecret(secret,root){
 if(!secret||!isAbsolute(secret))throw Error('Secret path must be absolute');
 const canonical=realpathSync(secret),base=realpathSync(root);
 for(const candidate of [resolve(secret),canonical]){
  const rel=relative(base,candidate);
  if(!rel||(!rel.startsWith('..'+sep)&&!isAbsolute(rel)&&rel!=='..'))throw Error('Secret must be outside build context');
 }
 if(!statSync(canonical).isFile()||!readFileSync(canonical,'utf8').trim())throw Error('Secret file required');
}
// Production always supplies a custody binding. The raw directory form remains
// an explicit unit-test seam for the shared owner-token/retry primitive only.
export function operationLockRoot(config,root,options){return bindOperationCustody(config,root,options);}
export function acquireOperationLock(project,config,directory,options={}){
 if(typeof directory==='object')return acquireCustodyLock(project,config,directory,options);
 const {remove=rmdirSync}=options;
 try{mkdirSync(directory,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
 for(let part=resolve(directory);;part=dirname(part)){if(lstatSync(part).isSymbolicLink())throw Error('Unsafe operation lock root');if(dirname(part)===part)break;}
 if(!lstatSync(directory).isDirectory())throw Error('Unsafe operation lock root');
 const key=createHash('sha256').update(project).digest('hex');
 const lock=join(directory,key+'.lock');
 return acquireDirectoryLock(lock,{remove,cleanupCode:'NEXUS_OPERATION_LOCK_CLEANUP',lockedCode:'NEXUS_OPERATION_LOCKED',diagnostics:{config:realpathSync(config)}});
}
export function runMigration(run,start){
 try{
  run(['stop','frontend','api']);
  run(['up','-d','--wait','postgres']);
  run(['up','--no-deps','--force-recreate','--abort-on-container-exit','--exit-code-from','migrate','migrate']);
  if(start)run(['up','-d','--no-build','--no-deps','--wait','api','frontend']);
 }catch(error){
  // Also quiesce a partially started/unhealthy new API/frontend; never roll schema back.
  try{run(['stop','frontend','api']);}catch{console.error('Maintenance shutdown could not be verified; inspect this exact project before permitting traffic.');}
  throw error;
 }
}
