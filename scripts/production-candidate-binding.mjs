import {lstatSync,realpathSync,openSync,closeSync,fstatSync,readSync,opendirSync} from 'node:fs';
import {candidateCustody} from './production-candidate-custody.mjs';
import {basename,join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const refuse=()=>{throw Error('Candidate binding could not be verified');};
export const candidateLimits=Object.freeze({manifest:65536,members:256,directories:128,member:16*1024*1024,total:64*1024*1024,path:240,depth:16});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fields=['dev','ino','size','mtimeNs','ctimeNs'];
function read(path,cap){
 const named=lstatSync(path,{bigint:true});
 if(!named.isFile()||named.isSymbolicLink()||named.nlink!==1n||named.size>BigInt(cap)||realpathSync(path)!==resolve(path))refuse();
 const fd=openSync(path,'r');
 try{
  const before=fstatSync(fd,{bigint:true});if(fields.some(k=>before[k]!==named[k]))refuse();
  const bytes=Buffer.alloc(Number(before.size)+1);let n=0,count;
  while(n<bytes.length&&(count=readSync(fd,bytes,n,bytes.length-n,null)))n+=count;
  const after=fstatSync(fd,{bigint:true});
  if(n!==Number(before.size)||after.nlink!==1n||fields.some(k=>before[k]!==after[k]))refuse();
  return {bytes:bytes.subarray(0,n),device:String(before.dev),inode:String(before.ino),size:String(before.size),hash:hash(bytes.subarray(0,n))};
 }finally{closeSync(fd);}
}
export function bindCandidate(root){
 root=resolve(root);const id=basename(root),limits=candidateLimits;
 if(!/^[a-f0-9]{64}$/.test(id))refuse();
 candidateCustody(root);
 const marker=read(join(root,'CANDIDATE_ID'),65),manifest=read(join(root,'MANIFEST.sha256'),limits.manifest);
 if(!marker.bytes.equals(Buffer.from(id))&&!marker.bytes.equals(Buffer.from(id+'\n')))refuse();
 if(manifest.hash!==id)refuse();
 const text=manifest.bytes.toString('utf8');if(!Buffer.from(text).equals(manifest.bytes)||!text.endsWith('\n'))refuse();
 const expected=new Map();
 for(const line of text.slice(0,-1).split('\n')){
  const match=/^([a-f0-9]{64}) \*([^\x00-\x1f\x7f]+)$/.exec(line);if(!match)refuse();
  const path=match[2],parts=path.split('/');
  if(path.length>limits.path||parts.length>limits.depth||parts.some(p=>!p||p==='.'||p==='..'||p.includes('\\')||p.includes(':'))||['MANIFEST.sha256','CANDIDATE_ID'].includes(path)||expected.has(path))refuse();
  expected.set(path,match[1]);if(expected.size>limits.members)refuse();
 }
 if([...expected.keys()].join('\n')!==[...expected.keys()].sort().join('\n'))refuse();
 const files=[{path:'CANDIDATE_ID',...marker},{path:'MANIFEST.sha256',...manifest}],directories=[];let total=marker.bytes.length+manifest.bytes.length;
 function walk(dir,prefix=''){
  const handle=opendirSync(dir);try{let entry;while((entry=handle.readSync())){
   const path=prefix+entry.name,full=join(dir,entry.name),s=lstatSync(full,{bigint:true});
   if(s.isSymbolicLink()||realpathSync(full)!==resolve(full))refuse();
   if(s.isDirectory()){
    if(path.split('/').length>limits.depth||directories.length>=limits.directories||![...expected.keys()].some(p=>p.startsWith(path+'/')))refuse();
    directories.push(full);walk(full,path+'/');
   }else{
    if(!prefix&&['CANDIDATE_ID','MANIFEST.sha256'].includes(path))continue;
    if(!expected.has(path))refuse();
    const file=read(full,Math.min(limits.member,limits.total-total));total+=file.bytes.length;
    if(file.hash!==expected.get(path))refuse();expected.delete(path);files.push({path,...file});
   }
  }}finally{handle.closeSync();}
 }
 walk(root);if(expected.size)refuse();
 return Object.freeze({root,files:files.map(({bytes,...file})=>Object.freeze(file)),directories});
}
export function checkCandidate(binding){
 const current=bindCandidate(binding.root);
 const stable=value=>JSON.stringify([...value.files].sort((a,b)=>a.path.localeCompare(b.path)));
 if(stable(current)!==stable(binding))refuse();
}
