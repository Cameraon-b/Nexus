import {openSync,closeSync,readSync,fstatSync,lstatSync,constants} from 'node:fs';
import {externalPath,fail} from './production-recovery.mjs';
export const maxSigningKeyBytes=64*1024;
const identity=s=>[s.dev,s.ino,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].join(':');
export function snapshotKey(path,root,{cap=maxSigningKeyBytes}={}){
 const source=externalPath(path,root);let fd;
 try{
  const before=lstatSync(source,{bigint:true});
  fd=openSync(source,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
  const st=fstatSync(fd,{bigint:true});
  if(!st.isFile()||st.nlink!==1n||st.size<1n||st.size>BigInt(cap)||identity(before)!==identity(st))fail();
  const bytes=Buffer.alloc(Number(st.size)+1);let size=0;
  while(size<bytes.length){const n=readSync(fd,bytes,size,bytes.length-size,null);if(!n)break;size+=n;}
  if(size!==Number(st.size)||identity(fstatSync(fd,{bigint:true}))!==identity(st)||identity(lstatSync(source,{bigint:true}))!==identity(st))fail();
  return {source,identity:identity(st),bytes:Buffer.from(bytes.subarray(0,size))};
 }catch{fail();}finally{if(fd!==undefined)closeSync(fd);}
}
export function recheckKey(snapshot,path,root){
 const current=snapshotKey(path,root);
 if(current.source!==snapshot.source||current.identity!==snapshot.identity||!current.bytes.equals(snapshot.bytes))fail();
}
