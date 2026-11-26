import {mkdirSync,writeFileSync,lstatSync,unlinkSync,rmdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {hostname} from 'node:os';
import {join} from 'node:path';
// No stale-lock stealing and no atomic compare-delete claim. An empty provisional
// directory can disappear under an old release; its acquirer must retry setup.
export function acquireDirectoryLock(path,{cleanupCode,lockedCode,diagnostics={},remove=rmdirSync,unlink=unlinkSync,entropy=randomBytes,mkdir=mkdirSync,stat=lstatSync,write=writeFileSync,attempts=4}={}){
 const cleanup=()=>Object.assign(Error('Lock cleanup unverified; inspect private recovery state.'),{code:cleanupCode});
 const locked=()=>Object.assign(Error('Operation lock is held or acquisition retry limit reached'),{code:lockedCode});
 const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
 if(!Number.isSafeInteger(attempts)||attempts<1||attempts>32)throw locked();
 for(let attempt=0;attempt<attempts;attempt++){
  // All fallible entropy, names, and bounded diagnostic serialization precede mkdir.
  const token=join(path,'owner-'+entropy(32).toString('hex')+'.json');
  const safe={pid:process.pid,host:hostname().slice(0,256)};
  if(diagnostics.config)safe.config=String(diagnostics.config).slice(0,2048);
  const json=JSON.stringify(safe);
  try{mkdir(path,{mode:0o700});}catch(e){if(e.code==='EEXIST')throw locked();throw e;}
  let identity,tokenIdentity,owned=false,done=false,failed=false;
  const directoryIsOurs=()=>{const st=stat(path);if(!st.isDirectory()||st.isSymbolicLink()||!same(st,identity))throw cleanup();};
  function release(){
   if(done)return;if(failed)throw cleanup();
   try{
    directoryIsOurs();
    if(owned){const st=stat(token);if(!st.isFile()||st.nlink!==1||!same(st,tokenIdentity))throw cleanup();unlink(token);try{stat(token);throw cleanup();}catch(e){if(e.code!=='ENOENT')throw e;}}
    directoryIsOurs();remove(path);try{stat(path);throw cleanup();}catch(e){if(e.code!=='ENOENT')throw e;}
    done=true;
   }catch{failed=true;throw cleanup();}
  }
  try{
   identity=stat(path);if(!identity.isDirectory()||identity.isSymbolicLink())throw cleanup();
   write(token,json,{flag:'wx',mode:0o600});owned=true;tokenIdentity=stat(token);directoryIsOurs();
   return release;
  }catch(error){
   // Only loss before a token is installed is retryable. Never recursively remove
   // a replacement. rmdir is deliberately nonrecursive even if identity is unknown.
   if(!owned){
    try{remove(path);}catch(e){if(e.code!=='ENOENT')throw cleanup();}
    try{stat(path);throw cleanup();}catch(e){if(e.code!=='ENOENT')throw cleanup();}
    if(error.code==='ENOENT')continue;
   }else{
    // A token-bearing directory cannot be removed by an old nonrecursive release.
    // Any external substitution here is uncertainty, not permission to delete it.
    release();
   }
   throw error;
  }
 }
 throw locked();
}
