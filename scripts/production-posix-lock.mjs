import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {residentLock} from './production-resident-lock.mjs';
// Read before custody validation; dispatch only reviewed cached bytes.
let helper;
try{helper=readFileSync(new URL('./posix-operation-lock.py',import.meta.url),'utf8');if(Buffer.byteLength(helper)>32768)helper=undefined;}catch{}
export async function acquirePosixLock(request){
 if(process.platform!=='linux'||!helper)throw Error('Operation lock could not be verified');
 const input=JSON.stringify(request)+'\n';
 if(Buffer.byteLength(input)>65536)throw Error('Operation lock could not be verified');
 // Matches the systemd preflight exactly; no PATH-dependent interpreter choice.
 // Node itself owns this additional abstract socket. A resident helper crash
 // cannot release project-wide exclusion across renamed/alternate custody roots.
 const owner=createServer();owner.unref();
 try{
  await new Promise((resolve,reject)=>{owner.once('error',reject);owner.listen({path:'\0nexus-owner-v1-'+process.getuid()+'-'+request.key},resolve);});
 }catch{owner.close();throw Object.assign(Error('Operation lock could not be verified'),{code:'NEXUS_OPERATION_LOCKED'});}
 const close=()=>new Promise(resolve=>owner.close(resolve));
 const child=spawn('/usr/bin/python3',['-I','-u','-c',helper],{stdio:['pipe','pipe','pipe'],shell:false});
 let result;
 try{result=await residentLock(child,input,{recovery:request.action==='recover'});}catch(e){await close();throw e;}
 if(request.action==='recover'){await close();return result;}
 const release=async()=>{await result();await close();};
 release.check=result.check;
 release.inputs=result.inputs;
 release.helperPid=result.helperPid;
 return release;
}
