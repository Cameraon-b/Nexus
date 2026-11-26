import {bindOperationCustody,acquireCustodyLock} from './production-lock-custody.mjs';
import {snapshotInput} from './production-input-snapshot.mjs';
import {bindCandidate,checkCandidate} from './production-candidate-binding.mjs';
import {retireQuartet} from './production-retention.mjs';
import {acquireDirectoryLock} from './production-directory-lock.mjs';
import {randomUUID} from 'node:crypto';
import {spawn as spawnProcess} from 'node:child_process';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {signingKey} from './production-signing.mjs';
import {fileURLToPath} from 'node:url';
import {join,resolve,isAbsolute} from 'node:path';
import {mkdirSync,readFileSync,readdirSync,existsSync,unlinkSync,chmodSync,createWriteStream,rmdirSync,closeSync} from 'node:fs';
import {externalPath,exactKeys,fail,validateRecipientFingerprint} from './production-recovery.mjs';
import {artifactPattern,artifactNames,verifyEnvelope,verifyEnvelopeBytes,quartetLimits,readBoundedFile} from './production-envelope.mjs';
import {publish,removePrivate} from './production-backup.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
function validateOptions(o){
 validateRecipientFingerprint(o.recipientFingerprint);
 if(!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(o.host)||!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(o.user)||!/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+$/.test(o.remote)||!/^nexus_prod_[a-z0-9_]+$/.test(o.project)||o.daily!==3||o.weekly!==2||o.monthly!==3)fail();
 for(const p of [o.key,o.destination,o.verificationKey,...(o.privateConfig?[o.privateConfig]:[])])if(!isAbsolute(p))fail();return o;
}
export function parsePullOptions(args){
 const required=['host','user','key','verification-key','recipient-fingerprint','remote','destination','project','daily','weekly','monthly'],allowed=[...required,'private-config'];const o={};
 for(let i=0;i<args.length;i+=2){const name=args[i]?.replace(/^--/,'');if(args[i]!=='--'+name||!allowed.includes(name)||Object.hasOwn(o,name)||!args[i+1])fail();o[name]=args[i+1];}
 if(required.some(k=>!Object.hasOwn(o,k)))fail();
 o.recipientFingerprint=o['recipient-fingerprint'];delete o['recipient-fingerprint'];o.verificationKey=o['verification-key'];delete o['verification-key'];o.daily=Number(o.daily);o.weekly=Number(o.weekly);o.monthly=Number(o.monthly);o.privateConfig=o['private-config'];delete o['private-config'];return validateOptions(o);
}
function isoWeek(created){const d=new Date(created);d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));const year=d.getUTCFullYear(),first=new Date(Date.UTC(year,0,1));return year+'-'+Math.ceil((((d-first)/86400000)+1)/7);}
export function selectRetention(records){
 const sorted=[...records].sort((a,b)=>b.created.localeCompare(a.created)),keep=new Set();
 for(const [count,bucket] of [[3,r=>r.created.slice(0,10)],[2,r=>isoWeek(r.created)],[3,r=>r.created.slice(0,7)]]){
  const seen=new Set();for(const r of sorted){const key=bucket(r);if(!seen.has(key)&&seen.size<count){seen.add(key);keep.add(r.artifact);}}
 }
 return keep;
}
function namesForArtifact(artifact){const stamp=artifactPattern.exec(artifact)?.[1];if(!stamp)fail();return artifactNames(stamp.replace(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/,'$1-$2-$3T$4:$5:$6Z'));}
function completeArtifacts(names){const set=new Set(names);return names.filter(a=>artifactPattern.test(a)&&Object.values(namesForArtifact(a)).every(n=>set.has(n))).sort();}
export async function pushFromPrivateConfig(path,repository,fetcher=fetch){
 try{
 const c=JSON.parse(readFileSync(externalPath(path,repository),'utf8'));exactKeys(c,['pushUrl']);
 const u=new URL(c.pushUrl);if(u.protocol!=='https:'||u.username||u.password||u.hash)fail();
 const r=await fetcher(u,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)fail();
 }catch{fail();}
}
export const maxVerifiedAgeMs=36*60*60*1000;
export const futureSkewMs=10*60*1000;
// SSH remote tokens are exclusively the validated host/path and generated filename grammar.
// Stream locally: remote stat cannot protect against a substituted or growing source.
export async function transferBounded(args,target,cap,{spawn=spawnProcess}={}){
 let child,timer,streaming;
 try{
  child=spawn('ssh',args,{shell:false,stdio:['ignore','pipe','pipe']});
  const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error('Transfer refused.')));});
  exited.catch(()=>{});child.stderr.resume();
  timer=setTimeout(()=>child.kill('SIGKILL'),300000);timer.unref();
  let bytes=0;const counter=new Transform({transform(chunk,encoding,callback){bytes+=chunk.length;callback(bytes>cap?Error('Transfer refused.'):null,bytes>cap?undefined:chunk);}});
  streaming=pipeline(child.stdout,counter,createWriteStream(target,{flags:'wx',mode:0o600}));
  await Promise.all([streaming,exited]);
 }catch{
  child?.kill('SIGKILL');child?.stdout?.destroy();
  if(streaming)try{await streaming;}catch{}
  // pipeline settles and closes the staged descriptor before unlink (also on Windows).
  try{if(existsSync(target))unlinkSync(target);if(existsSync(target))throw Error();}catch{const e=Error('Private transfer cleanup unverified.');e.code='NEXUS_PUBLICATION_CLEANUP';throw e;}
  fail();
 }finally{clearTimeout(timer);}
}
// 10,000 ASCII filename lines of 256 characters, each with CRLF.
export const listingByteCap=10000*(256+2);
export async function listBounded(args,{spawn=spawnProcess,deadlineMs=30000}={}){
 let child,timer;
 try{
  return await new Promise((resolve,reject)=>{
   const chunks=[];let bytes=0,settled=false;
   const refuse=()=>{if(settled)return;settled=true;child?.kill('SIGKILL');child?.stdout?.destroy();reject(Error('Listing refused.'));};
   child=spawn('ssh',args,{shell:false,stdio:['ignore','pipe','pipe']});
   child.once('error',refuse);child.stderr.resume();
   child.stdout.on('error',refuse);
   child.stdout.on('data',chunk=>{if(settled)return;if(chunk.length>listingByteCap-bytes){refuse();return;}bytes+=chunk.length;chunks.push(chunk);});
   child.once('close',code=>{if(settled)return;if(code!==0){refuse();return;}settled=true;resolve(Buffer.concat(chunks,bytes));});
   timer=setTimeout(refuse,deadlineMs);
  });
 }finally{clearTimeout(timer);}
}
export async function pullBackups(options){
 const {list=listBounded,transfer=transferBounded,notify,retirement,now=()=>new Date(),publication,lockCleanup=rmdirSync}=options;let stage,release,custody,unlockAttempted=false,publishedAny=false,candidateFailed=false,primary;const repository=options.root??root;
 const check=()=>{try{custody?.check();if(options.candidateBinding)checkCandidate(options.candidateBinding);}catch(e){candidateFailed=true;throw e;}};
 const guarded=async (step,boundary)=>{if(options.beforeBoundary)await options.beforeBoundary(boundary,custody);check();let primary;try{return await step();}catch(e){primary=e;throw e;}finally{try{check();}catch(cleanup){if(primary)throw new AggregateError([primary,cleanup],'Pull boundary and candidate check failed');throw cleanup;}}};
 const unlock=()=>{if(!release||unlockAttempted)return;unlockAttempted=true;release();};
 try{
  check();validateOptions(options);
  if(options.candidateBinding){
   const config=options.privateConfig??options.key;
   custody=await acquireCustodyLock(options.project+'_pull',config,bindOperationCustody(config,options.candidateBinding.root));
   check();
  }
  const recipientFingerprint=options.recipientFingerprint;
  const destination=externalPath(options.destination,repository,true),key=externalPath(options.key,repository),verificationKey=snapshotInput(options.verificationKey,repository).bytes;signingKey(verificationKey);
  const lockPath=join(destination,'.nexus_s10_pull.lock');check();release=acquireDirectoryLock(lockPath,{remove:lockCleanup,cleanupCode:'NEXUS_PULL_LOCK_CLEANUP'});check();
  const records=()=>completeArtifacts(readdirSync(destination)).map(artifact=>{const v=verifyEnvelopeBytes(destination,artifact,options.project,verificationKey,recipientFingerprint);return {...v.metadata,members:v.members,artifact};});
  const local=new Set(records().map(r=>r.artifact)); // Verify every complete local quartet before any remote access.
  const security=['-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-i',key];
  // SSH necessarily joins remote arguments. Every variable remote token uses a closed,
  // shell-metacharacter-free grammar; filenames are generated, never remote shell fragments.
  const bytes=await guarded(()=>list([...security,options.user+'@'+options.host,'ls','-1','--',options.remote]),'ssh');
  if(bytes.length>listingByteCap)fail();
  const listing=new TextDecoder('utf-8',{fatal:true}).decode(bytes).split(/\r?\n/).filter(Boolean);
  if(listing.length>10000||listing.some(n=>n.length>256)||new Set(listing).size!==listing.length)fail();
  const remote=completeArtifacts(listing);if(!remote.length)fail();
  const temporary=join(destination,'.nexus_s10_pull_'+randomUUID()+'.partial');
  check();mkdirSync(temporary,{mode:0o700});stage=temporary;chmodSync(stage,0o700);check();
  for(const artifact of remote){
   if(local.has(artifact))continue;
   const names=Object.values(namesForArtifact(artifact));
   for(const [kind,name] of Object.entries(namesForArtifact(artifact)))await guarded(()=>transfer([...security,options.user+'@'+options.host,'cat','--',options.remote+'/'+name],join(stage,name),quartetLimits[kind]));
   check();verifyEnvelope(stage,artifact,options.project,verificationKey,recipientFingerprint);check();
   const existing=names.filter(n=>existsSync(join(destination,n)));
   if(existing.length){
    if(existing.length!==4)fail();verifyEnvelope(destination,artifact,options.project,verificationKey,recipientFingerprint);
    if(Object.entries(namesForArtifact(artifact)).some(([kind,n])=>!readBoundedFile(join(stage,n),quartetLimits[kind]).equals(readBoundedFile(join(destination,n),quartetLimits[kind]))))fail();
   }else{
    const published=[];
    try{for(const name of names){const target=join(destination,name);check();publish(join(stage,name),target,publication);published.push(target);publishedAny=true;check();}}
    catch(e){if(published.length||e.code==='NEXUS_PUBLICATION_CLEANUP'){const error=Error('Published evidence preserved; inspect public quartet and exact-run private staging manually.');error.code='NEXUS_PUBLICATION_CLEANUP';throw error;}throw e;}
   }
   for(const name of names){check();removePrivate(join(stage,name));check();}
  }
  check();removePrivate(stage);stage=undefined;check();
  check();const verified=records(),keep=selectRetention(verified);check();
  if(!keep.size)fail();
  const newest=Math.max(...verified.map(r=>Date.parse(r.created))),age=Number(now())-newest;
  if(!Number.isFinite(age)||age>maxVerifiedAgeMs||age < -futureSkewMs)fail();
  for(const record of verified){if(keep.has(record.artifact))continue;
   // Reauthenticate and hand exact bytes/identities to Windows handle retention.
   const exact=verifyEnvelopeBytes(destination,record.artifact,options.project,verificationKey,recipientFingerprint,{holdDescriptors:true});
   try{await guarded(()=>retireQuartet(destination,exact.retirementMembers,{...retirement,descriptors:exact.descriptors}),'retention');}
   finally{for(const fd of Object.values(exact.descriptors))closeSync(fd);}
  }
  unlock();
  // Another pull may acquire the lock now. Do not touch its lock in finally.
  // Duplicate heartbeats are preferable to claiming unverified cleanup as green.
  check();
  if(notify)await guarded(notify,'notification');else if(options.privateConfig)await guarded(()=>pushFromPrivateConfig(options.privateConfig,repository),'notification');
  check();
  return {verified:verified.length,retained:keep.size};
 }catch(error){
  primary=['NEXUS_PUBLICATION_CLEANUP','NEXUS_PULL_LOCK_CLEANUP','NEXUS_RETENTION_CLEANUP','NEXUS_OPERATION_LOCK_CLEANUP'].includes(error.code)?error:Error('Recovery refused; inspect private recovery state.');
  if(!['NEXUS_PUBLICATION_CLEANUP','NEXUS_PULL_LOCK_CLEANUP','NEXUS_RETENTION_CLEANUP'].includes(error.code)&&publishedAny){primary=Error('Published evidence preserved; inspect public quartets and exact-run private staging manually.');primary.code='NEXUS_PUBLICATION_CLEANUP';}
  throw primary;
 }
 finally{
  try{try{if(stage&&!candidateFailed)removePrivate(stage);}finally{unlock();}}
  catch(error){primary=error;throw error;}
  finally{if(custody)try{await custody();}catch(cleanup){if(primary)throw new AggregateError([primary,cleanup],'Pull and candidate cleanup failed');throw cleanup;}}
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const candidateBinding=bindCandidate(root);const result=await pullBackups({...parsePullOptions(process.argv.slice(2)),candidateBinding});console.log(`Off-host backup verified; retention complete (${result.retained} retained).`);}
 catch(error){if(error instanceof AggregateError)error=error.errors[0];console.error(error.code==='NEXUS_PULL_LOCK_CLEANUP'?'NEXUS_PULL_LOCK_CLEANUP: pull lock cleanup unverified; no success notification. Inspect private recovery state.':error.code==='NEXUS_PUBLICATION_CLEANUP'?'NEXUS_PUBLICATION_CLEANUP: published evidence preserved; no success notification. Inspect public quartet and exact-run private staging.':error.code==='NEXUS_RETENTION_CLEANUP'?'NEXUS_RETENTION_CLEANUP: Windows handle retention unverified; no success notification. Inspect private retention state.':'Off-host backup failed or unknown; no success notification. Inspect private transfer/retention state.');process.exitCode=1;}
}
