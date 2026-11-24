import {mkdirSync,writeFileSync,rmSync,realpathSync,statSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {hostname} from 'node:os';
import {join,isAbsolute,relative,resolve,sep} from 'node:path';
export function validateSecret(secret,root){
 if(!secret||!isAbsolute(secret))throw Error('Secret path must be absolute');
 const canonical=realpathSync(secret),base=realpathSync(root);
 for(const candidate of [resolve(secret),canonical]){
  const rel=relative(base,candidate);
  if(!rel||(!rel.startsWith('..'+sep)&&!isAbsolute(rel)&&rel!=='..'))throw Error('Secret must be outside build context');
 }
 if(!statSync(canonical).isFile()||!readFileSync(canonical,'utf8').trim())throw Error('Secret file required');
}
export function acquireOperationLock(project,config,directory){
 mkdirSync(directory,{recursive:true});
 const key=createHash('sha256').update(project).digest('hex');
 const lock=join(directory,key+'.lock');
 // mkdir is exclusive on Windows and POSIX. Never infer death from elapsed time or PID reuse.
 try{mkdirSync(lock);}catch(error){
  if(error.code==='EEXIST'){const locked=new Error('Operation lock is held');locked.code='NEXUS_OPERATION_LOCKED';throw locked;}
  throw error;
 }
 try{writeFileSync(join(lock,'owner.json'),JSON.stringify({pid:process.pid,host:hostname(),config:realpathSync(config)}),{mode:0o600});}
 catch(e){rmSync(lock,{recursive:true,force:true});throw e;}
 return ()=>rmSync(lock,{recursive:true});
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
