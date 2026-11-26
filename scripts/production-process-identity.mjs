import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const fail=()=>Object.assign(Error('Operation owner could not be verified'),{code:'NEXUS_OPERATION_LOCK_CLEANUP'});
// Internal only. Never include process identities or interpreter diagnostics in errors.
export function processIdentity(pid=process.pid){
 if(!Number.isSafeInteger(pid)||pid<=0)throw fail();
 try{
  let start;
  if(process.platform==='linux'){
   const fields=readFileSync(`/proc/${pid}/stat`,'utf8').split(') ').at(-1).trim().split(/\s+/);
   if(['Z','X'].includes(fields[0]))throw fail();
   start=fields[19];
  }else if(process.platform==='win32'){
   const command=`$ErrorActionPreference='Stop';$p=Get-Process -Id ${pid};if($p.HasExited){exit 1};$p.StartTime.ToUniversalTime().ToFileTimeUtc().ToString()`;
   const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:1024});
   if(r.error||r.status!==0)throw fail();start=r.stdout.trim();
  }else throw fail();
  if(!/^[1-9][0-9]{0,19}$/.test(start))throw fail();
  return Object.freeze({pid:String(pid),start});
 }catch{throw fail();}
}
export function assertProcessIdentity(expected){
 const actual=processIdentity(Number(expected.pid));
 if(actual.start!==expected.start)throw fail();
}
