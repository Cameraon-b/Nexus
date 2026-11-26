// Disposable synthetic installed custody only; no operational/private paths.
import {cpSync,mkdirSync,writeFileSync,readFileSync,readdirSync,renameSync,rmSync,existsSync,lstatSync,chmodSync} from 'node:fs';
import {candidateCustody} from '../production-candidate-custody.mjs';
export function relaxFixture(path){
 if(!existsSync(path))return;
 if(process.platform==='win32'){
  const user=spawnSync('whoami.exe',[],{encoding:'utf8'}).stdout.trim();
  const r=spawnSync('icacls.exe',[path,'/grant:r',`${user}:F`,'/T','/C'],{encoding:'utf8'});
  if(r.status!==0)throw Error('Synthetic custody cleanup ACL failed');
 }else{
  function walk(p){const s=lstatSync(p);if(s.isSymbolicLink())return;chmodSync(p,s.isDirectory()?0o700:0o600);if(s.isDirectory())for(const name of readdirSync(p))walk(join(p,name));}walk(path);
 }
}
export function removeFixture(path,options){relaxFixture(path);return rmSync(path,options);}
import {createHash} from 'node:crypto';
import {bindOperationCustody} from '../production-lock-custody.mjs';
// Explicit synthetic-unit seam; never imported by production CLI code.
export const testBinding=(config,candidate)=>bindOperationCustody(config,candidate,{custodyRoot:resolve(candidate,'../../..')});
export function sealCandidate(root){
 const lines=[];
 function walk(dir,prefix=''){for(const entry of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))){const path=prefix+entry.name;if(entry.isDirectory())walk(join(dir,entry.name),path+'/');else lines.push(createHash('sha256').update(readFileSync(join(dir,entry.name))).digest('hex')+' *'+path+'\n');}}
 walk(root);lines.sort((a,b)=>a.slice(66)<b.slice(66)?-1:a.slice(66)>b.slice(66)?1:0);const manifest=lines.join(''),id=createHash('sha256').update(manifest).digest('hex');
 writeFileSync(join(root,'MANIFEST.sha256'),manifest);writeFileSync(join(root,'CANDIDATE_ID'),id+'\n');
 const target=join(root,'..',id);for(let attempt=0;;attempt++){try{renameSync(root,target);break;}catch(e){if(attempt>=19||!['EPERM','EBUSY'].includes(e.code))throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,50);}}candidateCustody(target,{install:true});return target;
}
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
export function privateCustody(d){
 if(process.platform==='win32'){
  const user=spawnSync('whoami.exe',[],{encoding:'utf8'}).stdout.trim();
  const r=spawnSync('icacls.exe',[d,'/inheritance:r','/grant:r',`${user}:(OI)(CI)F`],{encoding:'utf8'});
  if(r.status!==0)throw Error('Synthetic custody ACL initialization failed');
 }
}
export function operationCandidate(d){
 privateCustody(d);
 let root=join(d,'tools','candidates','test');mkdirSync(root,{recursive:true});
 cpSync(resolve('scripts'),join(root,'scripts'),{recursive:true});
 writeFileSync(join(root,'package.json'),'{"type":"module"}');
 cpSync(resolve('deployment'),join(root,'deployment'),{recursive:true});
 root=sealCandidate(root);
 return {root,cli:join(root,'scripts','production.mjs')};
}
