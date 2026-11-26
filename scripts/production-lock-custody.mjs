import {lstatSync,realpathSync,readFileSync} from 'node:fs';
import {bindCandidate,checkCandidate} from './production-candidate-binding.mjs';
import {acquirePosixLock} from './production-posix-lock.mjs';
import {gzipSync} from 'node:zlib';
import {spawn} from 'node:child_process';
import {residentLock} from './production-resident-lock.mjs';
import {processIdentity} from './production-process-identity.mjs';
import {randomBytes,createHash} from 'node:crypto';
import {dirname,basename,join,resolve,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
// Cache trusted candidate code at module load, before custody validation. Never
// execute a helper pathname that could be redirected after binding. Only public
// helper bytes enter EncodedCommand; the closed JSON request stays on stdin.
let encodedHelper;
try {
 const helperBytes=readFileSync(fileURLToPath(new URL('./windows-operation-lock.ps1',import.meta.url)));
 if(helperBytes.length>32768)throw Error('Helper too large');
 const packed=gzipSync(helperBytes).toString('base64');
 const bootstrap=`$ProgressPreference='SilentlyContinue';$m=[IO.MemoryStream]::new([Convert]::FromBase64String('${packed}'));$z=[IO.Compression.GZipStream]::new($m,[IO.Compression.CompressionMode]::Decompress);$r=[IO.StreamReader]::new($z,[Text.Encoding]::UTF8);try { & ([scriptblock]::Create($r.ReadToEnd())) } finally { $r.Dispose();$z.Dispose();$m.Dispose() }`;
 const encoded=Buffer.from(bootstrap,'utf16le').toString('base64');
 if(encoded.length<=28000)encodedHelper=encoded;
} catch { /* Refuse later inside the CLI's generic error boundary. */ }
const fail=code=>Object.assign(Error('Operation lock custody could not be verified'),{code});
const same=(a,b)=>a.device===b.device&&a.inode===b.inode&&(process.platform!=='linux'||(a.uid===b.uid&&a.mode===b.mode));
function identity(path){const s=lstatSync(path,{bigint:true});if(!s.isDirectory()||s.isSymbolicLink()||realpathSync(path)!==resolve(path))throw fail();return {path:resolve(path),device:String(s.dev),inode:String(s.ino),...(process.platform==='linux'?{uid:String(s.uid),mode:String(s.mode&0o7777n)}:{})};}
const within=(base,path)=>{const rel=relative(base,path);return !!rel&&rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel);};
export function bindOperationCustody(config,candidate,{custodyRoot}={}){
 candidate=resolve(candidate);
 // The installed layout is an explicit custody contract, never a common-ancestor
 // guess. A source checkout is deliberately not an operational installation.
 const family=dirname(candidate),tools=dirname(family);
 const custody=resolve(custodyRoot??dirname(tools));
 if(!custodyRoot&&(basename(family)!=='candidates'||basename(tools)!=='tools'))throw fail();
 if(dirname(custody)===custody||!within(custody,candidate)||!within(custody,resolve(config))||within(candidate,resolve(config)))throw fail();
 const configStat=lstatSync(config,{bigint:true});
 if(realpathSync(config)!==resolve(config)||!configStat.isFile()||configStat.nlink!==1n)throw fail();
 const configIdentity={device:String(configStat.dev),inode:String(configStat.ino)};
 // Explicit programmatic unit-fixture seam only. CLI supplies no custodyRoot.
 const candidateBinding=custodyRoot?undefined:bindCandidate(candidate);
 const bindings=new Map();
 for(const start of [candidate,...(candidateBinding?.directories??[]),dirname(resolve(config)),custody])for(let p=start;;p=dirname(p)){if(!bindings.has(p))bindings.set(p,identity(p));if(dirname(p)===p)break;}
 const directory=join(custody,'.nexus-production-locks');
 try{bindings.set(directory,identity(directory));}catch(e){if(e.code!=='ENOENT')throw e;}
 return Object.freeze({custody,directory,config:resolve(config),configIdentity,candidateBinding,bindings:[...bindings.values()]});
}
function transact(request){
 if(process.platform!=='win32'||!encodedHelper)throw fail(); // No pathname-only fallback on unsupported hosts.
 const input=JSON.stringify(request)+'\n';if(Buffer.byteLength(input)>65536)throw fail();
 const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',encodedHelper],{stdio:['pipe','pipe','pipe'],shell:false,windowsHide:true});
 return residentLock(child,input,{recovery:request.action==='recover'});
}
export function acquireCustodyLock(project,config,binding,{beforeCreate=()=>{}}={}){
 if(resolve(config)!==binding.config)throw fail();
 // Deterministic test seam, not exported through the production CLI.
 for(const expected of binding.bindings)if(!same(expected,identity(expected.path)))throw fail();
 beforeCreate();
 return dispatch('acquire',project,binding);
}
async function dispatch(action,project,binding){
 if(binding.candidateBinding)checkCandidate(binding.candidateBinding);
 const request={version:1,action,owner:action==='acquire'?processIdentity():null,bindings:binding.bindings,custody:binding.custody,directory:binding.directory,config:binding.config,key:createHash('sha256').update(project).digest('hex')+'.lock',token:'owner-'+randomBytes(32).toString('hex')+'.json',...(binding.candidateBinding?{candidate:binding.candidateBinding}:{})};
 const native=await (process.platform==='linux'?acquirePosixLock(request):transact({...request,configIdentity:binding.configIdentity}));
 if(action!=='acquire'||!binding.candidateBinding)return native;
 const check=()=>{native.check();checkCandidate(binding.candidateBinding);};
 let completion;
 const release=()=>completion??=(async()=>{
  let primary;try{check();}catch(e){primary=e;}
  try{await native();}catch(cleanup){if(primary)throw new AggregateError([primary,cleanup],'Candidate and lock cleanup failed');throw cleanup;}
  if(primary)throw primary;
  checkCandidate(binding.candidateBinding);
 })();
 release.inputs=native.inputs;release.helperPid=native.helperPid;release.check=check;return release;
}
export function recoverCustodyLock(project,config,binding){
 if(resolve(config)!==binding.config)throw fail();
 for(const expected of binding.bindings)if(!same(expected,identity(expected.path)))throw fail();
 return dispatch('recover',project,binding);
}
