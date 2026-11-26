import {spawn as spawnProcess} from 'node:child_process';
import {lstatSync,fstatSync,closeSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {memberIdentity,artifactNames,artifactPattern,quartetLimits,readBoundedSnapshot} from './production-envelope.mjs';
const uncertain=()=>Object.assign(Error('Windows handle retention unverified; no success notification. Inspect private retention state.'),{code:'NEXUS_RETENTION_CLEANUP'});
export function validWindowsIdentity(text,bits){return typeof text==='string'&&/^(0|[1-9][0-9]*)$/.test(text)&&text.length<=20&&BigInt(text)<(1n<<BigInt(bits));}
const repository=fileURLToPath(new URL('../',import.meta.url));
const helper=fileURLToPath(new URL('./windows-retire-quartet.ps1',import.meta.url));
// Explicit module-level test dependency injection only. No CLI/config/environment seam.
export async function invokeRetentionHelper(request,{spawn=spawnProcess,deadlineMs=30000}={}){
 let child,timer;
 try{return await new Promise((resolve,reject)=>{
  let settled=false,bytes=0;const output=[];
  const refuse=()=>{if(settled)return;settled=true;child?.kill('SIGKILL');reject(uncertain());};
  child=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper],{shell:false,stdio:['pipe','pipe','pipe'],windowsHide:true});
  child.once('error',refuse);child.stdin.on('error',refuse);child.stdout.on('error',refuse);child.stderr.on('error',refuse);
  child.stdout.on('data',b=>{bytes+=b.length;if(bytes>128)return refuse();output.push(b);});
  child.stderr.on('data',refuse);
  child.once('close',code=>{if(settled)return;if(code!==0||Buffer.concat(output).toString('utf8')!=='NEXUS_RETENTION_OK\r\n')return refuse();settled=true;resolve();});
  timer=setTimeout(refuse,deadlineMs);child.stdin.end(JSON.stringify(request));
 });}catch{throw uncertain();}finally{clearTimeout(timer);}
}
export async function retireQuartet(destination,members,{descriptors, ...testDependencies}={}){
 try{
  if(process.platform!=='win32'||!descriptors)throw uncertain();
  const entries=Object.entries(members);if(entries.length!==4)throw uncertain();
  const artifact=entries[0][0],stamp=artifactPattern.exec(artifact)?.[1];if(!stamp)throw uncertain();
  const names=artifactNames(stamp.replace(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/,'$1-$2-$3T$4:$5:$6Z'));
  const request={version:1,directory:resolve(destination),members:Object.entries(names).map(([kind,name])=>{
   const m=members[name];if(!m||m.name!==name||!Number.isSafeInteger(m.length)||m.length<0||m.length>quartetLimits[kind]||typeof m.sha256!=='string'||m.sha256.length!==64||!/^[a-f0-9]{64}$/.test(m.sha256))throw uncertain();
   if(!validWindowsIdentity(m.device,32)||!validWindowsIdentity(m.inode,64))throw uncertain();
   return {name,length:m.length,sha256:m.sha256,device:m.device,inode:m.inode};
  })};
  // Candidate-contained helper, never a caller-specified or external script.
  if(resolve(realpathSync(helper))!==resolve(join(realpathSync(repository),'scripts','windows-retire-quartet.ps1'))||lstatSync(join(repository,'scripts')).isSymbolicLink())throw uncertain();
  const script=readBoundedSnapshot(helper,32768);
  if(!lstatSync(helper).isFile()||lstatSync(helper).isSymbolicLink()||memberIdentity(lstatSync(helper,{bigint:true}))!==script.identity)throw uncertain();
  // Recheck exact authenticated descriptors immediately before releasing them for
  // Windows share compatibility. The helper reauthenticates identity and bytes.
  for(const [name,m] of entries){const fd=descriptors[name];if(fd===undefined)throw uncertain();const st=fstatSync(fd,{bigint:true});if(memberIdentity(st)!==m.identity||st.dev.toString()!==m.device||st.ino.toString()!==m.inode)throw uncertain();}
  for(const name of Object.keys(descriptors)){closeSync(descriptors[name]);delete descriptors[name];}
  await invokeRetentionHelper(request,testDependencies);
  for(const {name} of request.members){try{lstatSync(join(destination,name));}catch(e){if(e.code==='ENOENT')continue;throw e;}throw uncertain();}
 }catch{throw uncertain();}
}
