import {readFileSync,lstatSync,readdirSync,chmodSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
const refuse=()=>{throw Error('Candidate custody refused');};
const source=readFileSync(new URL('./candidate-custody.ps1',import.meta.url),'utf8');
const encoded=Buffer.from(source,'utf16le').toString('base64');
export function candidateCustody(root,{install=false}={}){
 if(process.platform==='win32'){
  const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',encoded],{input:JSON.stringify({action:install?'install':'verify',root}),encoding:'utf8',timeout:30000,windowsHide:true,maxBuffer:65536,shell:false});
  if(r.error||r.status!==0||r.stdout!=='verified')refuse();return;
 }
 if(process.platform!=='linux')refuse();
 const paths=[];
 function walk(path){
  const s=lstatSync(path);if(s.isSymbolicLink()||(!s.isDirectory()&&!s.isFile())||s.uid!==process.getuid()||s.isFile()&&s.nlink!==1)refuse();
  paths.push(path);if(paths.length>386)refuse();
  if(s.isDirectory())for(const name of readdirSync(path))walk(join(path,name));
  if(install)chmodSync(path,s.isDirectory()?0o500:0o400);
  else if((s.mode&0o7777)!==(s.isDirectory()?0o500:0o400))refuse();
 }
 walk(root);
 // Linux POSIX ACL aliases are not represented completely by the mode bits.
 const r=spawnSync('python3',['-c',"import os,json,sys\nfor p in json.load(sys.stdin):\n a=os.listxattr(p,follow_symlinks=False)\n if any(x in a for x in ('system.posix_acl_access','system.posix_acl_default')): sys.exit(1)"],{input:JSON.stringify(paths),encoding:'utf8',timeout:30000,maxBuffer:65536,shell:false});
 if(r.error||r.status!==0)refuse();
 if(install)candidateCustody(root);
}
