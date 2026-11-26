import {openSync,fstatSync,readSync,closeSync} from 'node:fs';
// Only closed-protocol helper paths may reach this explicit proc-fd reader.
// Ordinary external input validation must continue rejecting all symlinks.
export function readPinnedInput(path,cap){
 if(!/^\/proc\/[1-9][0-9]*\/fd\/[1-9][0-9]{0,5}$/.test(path)||!Number.isSafeInteger(cap)||cap<1)throw Error('Pinned input refused');
 const fd=openSync(path,'r');
 try{
  const before=fstatSync(fd,{bigint:true});
  if(!before.isFile()||before.nlink!==1n||before.size>BigInt(cap))throw Error('Pinned input refused');
  const bytes=Buffer.alloc(Number(before.size)+1);let size=0,n;
  while(size<bytes.length&&(n=readSync(fd,bytes,size,bytes.length-size,null))>0)size+=n;
  const after=fstatSync(fd,{bigint:true});
  if(size!==Number(before.size)||['dev','ino','size','mtimeNs','ctimeNs'].some(k=>before[k]!==after[k]))throw Error('Pinned input refused');
  return bytes.subarray(0,size);
 }finally{closeSync(fd);}
}
