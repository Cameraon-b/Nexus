import {mkdirSync,lstatSync,realpathSync,readFileSync,writeFileSync,existsSync,openSync,fstatSync,closeSync,readSync} from 'node:fs';
import {resolve,join,dirname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {candidateInventory} from './production-candidate-inventory.mjs';
import {bindCandidate} from './production-candidate-binding.mjs';
import {candidateCustody} from './production-candidate-custody.mjs';
const refuse=()=>{throw Error('Candidate lifecycle refused; no existing candidate overwritten. Inspect exact public installation state.');};
const hash=b=>createHash('sha256').update(b).digest('hex');
function canonical(path){
 if(!isAbsolute(path)||resolve(path)!==path)refuse();
 for(let p=path;;p=dirname(p)){
  const s=lstatSync(p);if(s.isSymbolicLink()||realpathSync(p)!==p)refuse();if(dirname(p)===p)break;
 }
 return path;
}
function exactRead(path,cap){
 canonical(path);const named=lstatSync(path,{bigint:true});
 if(!named.isFile()||named.nlink!==1n||named.size>BigInt(cap))refuse();
 const fd=openSync(path,'r');
 try{
  const before=fstatSync(fd,{bigint:true}),fields=['dev','ino','nlink','mode','size','mtimeNs','ctimeNs'];
  if(fields.some(k=>before[k]!==named[k]))refuse();
  const bytes=Buffer.alloc(Number(before.size)+1);let n=0,count;
  while(n<bytes.length&&(count=readSync(fd,bytes,n,bytes.length-n,null)))n+=count;
  for(const after of [fstatSync(fd,{bigint:true}),lstatSync(path,{bigint:true})])if(fields.some(k=>before[k]!==after[k]))refuse();
  if(n!==Number(before.size))refuse();return bytes.subarray(0,n);
 }finally{closeSync(fd);}
}
function inventory(members){
 if(Object.keys(members).sort().join('\n')!==candidateInventory.join('\n'))refuse();
 let total=0;
 for(const bytes of Object.values(members)){if(!Buffer.isBuffer(bytes)||bytes.length>16*1024*1024)refuse();total+=bytes.length;}
 if(total>64*1024*1024)refuse();
 const manifest=Buffer.from(candidateInventory.map(p=>hash(members[p])+' *'+p+'\n').join(''));
 return {id:hash(manifest),manifest,marker:Buffer.from(hash(manifest)+'\n')};
}
export function verifyCandidate(root){
 const binding=bindCandidate(canonical(root));
 const names=binding.files.map(f=>f.path).filter(p=>!['CANDIDATE_ID','MANIFEST.sha256'].includes(p)).sort();
 if(names.join('\n')!==candidateInventory.join('\n'))refuse();return binding;
}
export function installCandidate(custody,members){
 canonical(custody);const {id,manifest,marker}=inventory(members);
 const parent=join(custody,'tools/candidates');mkdirSync(parent,{recursive:true,mode:0o700});canonical(parent);
 const root=join(parent,id);
 if(existsSync(root)){
  verifyCandidate(root);
  for(const [name,bytes] of Object.entries({...members,'MANIFEST.sha256':manifest,'CANDIDATE_ID':marker}))if(!exactRead(join(root,name),16*1024*1024).equals(bytes))refuse();
  return id;
 }
 // Exclusive directory creation is the no-clobber reservation. Interrupted or
 // concurrent incomplete installs refuse; they are never repaired/overwritten.
 mkdirSync(root,{mode:0o700});
 for(const [name,bytes] of Object.entries({...members,'MANIFEST.sha256':manifest,'CANDIDATE_ID':marker})){
  mkdirSync(dirname(join(root,name)),{recursive:true,mode:0o700});writeFileSync(join(root,name),bytes,{flag:'wx',mode:0o600});
 }
 candidateCustody(root,{install:true});verifyCandidate(root);return id;
}
export function candidateCommand(args){
 const action=args[0],schemas={construct:['--source','--custody'],verify:['--candidate'],package:['--candidate','--output'],install:['--package','--custody']},keys=schemas[action];
 if(!keys||args.length!==1+keys.length*2)refuse();
 const o={};for(let i=1;i<args.length;i+=2){if(!keys.includes(args[i])||Object.hasOwn(o,args[i])||!isAbsolute(args[i+1]))refuse();o[args[i]]=args[i+1];}
 if(action==='construct'){
  const source=canonical(o['--source']),members=Object.fromEntries(candidateInventory.map(p=>[p,exactRead(join(source,p),16*1024*1024)]));
  return installCandidate(o['--custody'],members);
 }
 if(action==='verify')return verifyCandidate(o['--candidate']).root.split(/[\\/]/).at(-1);
 if(action==='package'){
  const root=o['--candidate'];verifyCandidate(root);
  const members=Object.fromEntries(candidateInventory.map(p=>[p,exactRead(join(root,p),16*1024*1024)])),{id,manifest,marker}=inventory(members);
  if(!manifest.equals(exactRead(join(root,'MANIFEST.sha256'),65536))||!marker.equals(exactRead(join(root,'CANDIDATE_ID'),65)))refuse();
  canonical(dirname(o['--output']));
  const bytes=Buffer.from(JSON.stringify({version:1,id,members:Object.fromEntries(candidateInventory.map(p=>[p,members[p].toString('base64')]))})+'\n');
  if(existsSync(o['--output'])){if(!exactRead(o['--output'],90*1024*1024).equals(bytes))refuse();}
  else writeFileSync(o['--output'],bytes,{flag:'wx',mode:0o600});
  verifyCandidate(root);return id;
 }
 const bytes=exactRead(o['--package'],90*1024*1024),p=JSON.parse(bytes);
 if(!p||Object.keys(p).sort().join(',')!=='id,members,version'||p.version!==1||typeof p.id!=='string'||!p.members||typeof p.members!=='object'||Array.isArray(p.members))refuse();
 const members=Object.fromEntries(Object.entries(p.members).map(([name,b64])=>{
  if(typeof b64!=='string')refuse();const bytes=Buffer.from(b64,'base64');if(bytes.toString('base64')!==b64)refuse();return [name,bytes];
 }));
 if(inventory(members).id!==p.id)refuse();
 // Canonical reserialization also refuses duplicate/unknown JSON fields.
 if(!bytes.equals(Buffer.from(JSON.stringify({version:1,id:p.id,members:Object.fromEntries(candidateInventory.map(n=>[n,members[n].toString('base64')]))})+'\n')))refuse();
 return installCandidate(o['--custody'],members);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(candidateCommand(process.argv.slice(2)));}
 catch{console.error('Candidate lifecycle refused; no existing candidate overwritten. Inspect exact public installation state.');process.exitCode=1;}
}
