import {snapshotInput,recheckInput,recoverySnapshots,checkRecoveryInputs} from './production-input-snapshot.mjs';
import {createPublicKey,createPrivateKey} from 'node:crypto';
import {readPinnedInput} from './production-pinned-input.mjs';
import {spawnSync} from 'node:child_process';
import {chmodSync,mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync,lstatSync,linkSync,unlinkSync,realpathSync,readdirSync,statSync} from 'node:fs';
import {join,isAbsolute,basename,dirname} from 'node:path';
import {composeEnvironment} from './production-environment.mjs';
import {externalPath,loadBackupConfig,fail,hash,packTar,keyFingerprint,validatePlaintext,exactKeys,validateRecipientFingerprint} from './production-recovery.mjs';
import {validateIncludes} from './production-includes.mjs';
import {auditBackupCompose,auditBackupRuntime} from './production-backup-audit.mjs';
import {matchingKeys} from './production-signing.mjs';
import {snapshotKey,recheckKey} from './production-key-snapshot.mjs';
import {artifactNames,validateMetadata,verifyEnvelope,verifyEnvelopeBytes,signEnvelope,readBoundedFile,maxCiphertextBytes} from './production-envelope.mjs';
import {aggregateSql,parseAggregates,sameAggregates,psqlArgs} from './production-aggregates.mjs';
import {validateRestoreConfig,restoreStack} from './production-restore.mjs';
export function parseRecoveryOptions(command,args){
 const required=['--project',...(command==='restore-verify'?[]:['--config-file']),'--backup-config',...(command==='backup'?[]:['--artifact']),...(command==='restore-verify'?['--confirm-disposable','--restore-config']:[])];
 if(!['backup','verify-backup','restore-verify'].includes(command)||args.length!==required.length*2)fail();
 const options={};for(let i=0;i<args.length;i+=2){const key=args[i];if(!required.includes(key)||Object.hasOwn(options,key)||!args[i+1])fail();options[key]=args[i+1];}
 const project=options['--project'];
 if(command==='restore-verify'){if(!/^nexus_s10_restore_[a-z0-9_]+$/.test(project)||options['--confirm-disposable']!==project)fail();}
 else if(!/^nexus_(prod|s8)_[a-z0-9_]+$/.test(project))fail();
 for(const key of required.filter(k=>!['--project','--confirm-disposable'].includes(k)))if(!isAbsolute(options[key]))fail();
 return {project,env:options['--config-file'],backupConfig:options['--backup-config'],artifact:options['--artifact'],restoreConfig:options['--restore-config']};
}
export function execute(executable,args,options={},spawn=spawnSync){
 if(!Array.isArray(args)||args.some(a=>typeof a!=='string'))fail();
 const r=spawn(executable,args,{timeout:300000,maxBuffer:512*1024*1024,...options,shell:false,stdio:'pipe'});
 if(r.error||r.status!==0)fail();return Buffer.from(r.stdout??'');
}
export function removePrivate(path){try{rmSync(path,{recursive:true,force:true});if(existsSync(path))fail();}catch{const e=Error('Sensitive cleanup could not be verified; private recovery inspection required.');e.code='NEXUS_RECOVERY_CLEANUP';throw e;}}
// Atomic no-clobber publication (rename alone overwrites on POSIX).
export function publish(source,target,{link=linkSync,unlink=unlinkSync}={}){
 link(source,target);
 try{unlink(source);}catch{
  const e=Error('Published evidence preserved; inspect public quartet and exact-run private staging manually.');e.code='NEXUS_PUBLICATION_CLEANUP';throw e;
 }
}
export const maxDatabaseBytes=192*1024*1024;
export const maxArchiveBytes=512*1024*1024;
export const maxIncludeBytes=1024*1024;
export const maxRecipientBytes=64*1024;
export const databaseSizeSql="SELECT pg_database_size(current_database())::text;";
function databaseSize(bytes){const s=bytes.toString().trim();if(!/^\d+$/.test(s))fail();const n=Number(s);if(!Number.isSafeInteger(n)||n<1||n>maxDatabaseBytes)fail();return n;}
// Private ACLs are reviewed when snapshotting; boundaries bind the exact
// source identity (including mode/ctime) and bytes, without resnapshotting policy.
function checkSnapshot(snapshot,root){
 const current=snapshotKey(snapshot.source,root,{cap:snapshot.cap});
 if(current.identity!==snapshot.identity||!current.bytes.equals(snapshot.bytes))fail();
}
export function backup({project,env,root,config,backupConfig,run=execute,now=()=>new Date(),publication,cleanup=removePrivate,pinnedConfig}){
 let stage,published=[],primary;
 const clean=path=>{try{cleanup(path);}catch{const e=Error('Sensitive cleanup unverified; private recovery inspection required.');e.code='NEXUS_RECOVERY_CLEANUP';throw e;}};
 try{
  config??=loadBackupConfig(backupConfig,root,{pinnedConfig});
  const sourcePath=source=>pinnedConfig&&source===pinnedConfig.path?source:externalPath(source,root);
  const recipientFingerprint=validateRecipientFingerprint(config.recipientFingerprint);
  const signing=config[recoverySnapshots]?.signingKey??snapshotKey(config.signingKey,root),verifying=config[recoverySnapshots]?.verificationKey??snapshotKey(config.verificationKey,root);
  matchingKeys(signing.bytes,verifying.bytes);
  const production=pinnedConfig?.path??externalPath(env,root);
  const productionInput=snapshotInput(pinnedConfig?.original??env,root,maxIncludeBytes);
  if(config.includes.find(i=>i.name==='production.env').source!==production)fail();
  const n=artifactNames(now().toISOString().replace('.000Z','Z').replace(/\.\d{3}Z$/,'Z'));
  if(Object.values(n).some(name=>existsSync(join(config.output,name))))fail();
  stage=mkdtempSync(join(config.output,n.artifact+'.staging-'));chmodSync(stage,0o700);
  const snapshotVerifier=verifying.bytes;
  const stamp=p=>{const s=pinnedConfig&&p===pinnedConfig.path?statSync(p,{bigint:true}):lstatSync(p,{bigint:true});if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1n)fail();return [s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');};
  const recipientSource=externalPath(config.recipient,root),recipientIdentity=stamp(recipientSource),recipientBytes=readBoundedFile(recipientSource,maxRecipientBytes);
  if(!recipientBytes.length||hash(recipientBytes)!==recipientFingerprint||stamp(recipientSource)!==recipientIdentity)fail();
  const snapshotRecipient=join(stage,'age-recipients');writeFileSync(snapshotRecipient,recipientBytes,{mode:0o600,flag:'wx'});
  const readSource=source=>pinnedConfig&&source===pinnedConfig.path?readPinnedInput(source,maxIncludeBytes):readBoundedFile(source,maxIncludeBytes);
  const snapshot=config.includes.map(i=>{const source=sourcePath(i.source),identity=stamp(source),bytes=readSource(source);if(stamp(source)!==identity)fail();return {name:i.name,source,identity,bytes};});
  const includeFiles=Object.fromEntries(snapshot.map(i=>['includes/'+i.name,i.bytes]));validateIncludes(includeFiles);
  const unchanged=()=>{
   checkSnapshot(productionInput,root);for(const s of Object.values(config[recoverySnapshots]??{}))checkSnapshot(s,root);
   recheckKey(signing,config.signingKey,root);recheckKey(verifying,config.verificationKey,root);
   if(config.recipientFingerprint!==recipientFingerprint||config.recipient!==recipientSource||externalPath(recipientSource,root)!==recipientSource||stamp(recipientSource)!==recipientIdentity||!readBoundedFile(recipientSource,maxRecipientBytes).equals(recipientBytes))fail();
   for(const i of snapshot){if(config.includes.find(x=>x.name===i.name)?.source!==i.source||sourcePath(i.source)!==i.source||stamp(i.source)!==i.identity||!readSource(i.source).equals(i.bytes))fail();}
  };
  const snapshotEnv=join(stage,'production.env');writeFileSync(snapshotEnv,includeFiles['includes/production.env'],{mode:0o400,flag:'wx'});chmodSync(snapshotEnv,0o400);
  const envSnapshot=snapshotInput(snapshotEnv,root,maxIncludeBytes);
  if(!envSnapshot.bytes.equals(productionInput.bytes))fail();
  const checkEnv=()=>checkSnapshot(envSnapshot,root);
  const compose=['compose','--project-name',project,'--env-file',snapshotEnv,'-f','deployment/compose.production.yaml'];
  const docker=(args,{availability=false}={})=>{
   checkEnv();if(!availability)unchanged();
   const result=run('docker',args,{cwd:root,env:composeEnvironment()});
   checkEnv();if(!availability)unchanged();return result;
  };
  const c=JSON.parse(docker([...compose,'config','--format','json']));
  exactKeys(c.services,['api','frontend','migrate','postgres']);
  if(config.includes.find(i=>i.name==='database-password').source!==externalPath(c.secrets?.database_password?.file,root))fail();
  const commit=c.services.api.image?.replace(/^nexus-api:/,'');
  const ids=docker([...compose,'ps','--all','--quiet','--no-trunc']).toString().trim().split(/\s+/);
  if(ids.length!==4||new Set(ids).size!==4||ids.some(id=>! /^[a-f0-9]{64}$/.test(id)))fail();
  const containers=JSON.parse(docker(['inspect',...ids]));
  if(!Array.isArray(containers)||containers.length!==4||new Set(containers.map(c=>c.Id)).size!==4)fail();
  const services=new Map(),imageIds={};
  if(c.services.migrate.image!==c.services.api.image)fail();
  for(const container of containers){
   const label=container.Config?.Labels,service=label?.['com.docker.compose.service'];
   if(label?.['com.docker.compose.project']!==project||!['api','postgres','frontend','migrate'].includes(service)||services.has(service)||!ids.includes(container.Id))fail();
   if(container.Config.Image!==c.services[service].image||!/^sha256:[a-f0-9]{64}$/.test(container.Image))fail();
   if(service!=='postgres'&&label['org.opencontainers.image.revision']!==commit)fail();
   if(service!=='migrate')imageIds[service]=container.Image;
   if(service==='migrate'?(container.State.Status!=='exited'||container.State.ExitCode!==0):(container.State.Status!=='running'||(['api','postgres'].includes(service)&&container.State.Health?.Status!=='healthy')))fail();
   services.set(service,container.Id);
  }
  if(services.size!==4||!['api','postgres','frontend','migrate'].every(s=>services.has(s)))fail();
  const apiContainer=containers.find(c=>c.Id===services.get('api')),migration=containers.find(c=>c.Id===services.get('migrate'));
  if(apiContainer.Image!==migration.Image)fail();
  const secret=externalPath(c.secrets.database_password.file,root),settings=auditBackupCompose(c,{project,secret,root});
  const audit=all=>{if(all.length!==4||new Set(all.map(x=>x.Id)).size!==4||all.some(x=>!containers.some(y=>y.Id===x.Id&&y.Image===x.Image&&JSON.stringify(y.Config)===JSON.stringify(x.Config))))fail();auditBackupRuntime(all,c,{project,secret,settings});};
  audit(containers);unchanged();
  const networks=JSON.parse(docker(['network','inspect',project+'_backend',project+'_edge']));
  if(!Array.isArray(networks)||networks.length!==2)fail();
  for(const name of ['backend','edge']){const network=networks.find(n=>n.Name===project+'_'+name);if(!network||network.Internal!==(name==='backend')||network.Labels?.['com.docker.compose.project']!==project||network.Labels?.['com.docker.compose.network']!==name)fail();}
  const pg=services.get('postgres');
  databaseSize(docker(psqlArgs(pg,databaseSizeSql))); // Measured fail-closed before stopping application writers.
  let aggregates,dump,keys,fingerprint,files;
  try{
  docker([...compose,'stop','--timeout','30','frontend','api']);
  const stopped=JSON.parse(docker(['inspect',...ids]));
  if(stopped.length!==4||new Set(stopped.map(x=>x.Id)).size!==4||stopped.some(x=>!containers.some(y=>y.Id===x.Id&&y.Image===x.Image&&JSON.stringify(y.Config)===JSON.stringify(x.Config))))fail();
  for(const service of ['api','frontend'])if(stopped.find(x=>x.Id===services.get(service))?.State.Status!=='exited')fail();
  const database=stopped.find(x=>x.Id===pg);if(database?.State.Status!=='running'||database.State.Health?.Status!=='healthy')fail();
  databaseSize(docker(psqlArgs(pg,databaseSizeSql)));
  aggregates=parseAggregates(docker(psqlArgs(pg,aggregateSql)));
  dump=docker(['exec',pg,'pg_dump','--format=custom','--no-owner','--no-acl','-U','nexus','-d','nexus']);
  if(!dump.subarray(0,5).equals(Buffer.from('PGDMP')))fail();
  unchanged();checkEnv();run('docker',['exec','-i',pg,'pg_restore','--list'],{cwd:root,env:composeEnvironment(),input:dump});checkEnv();unchanged();
  const capture=()=>docker(['run','--rm','--pull','never','--name',project+'_key_backup','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--user','1654:1654','--mount',`type=volume,src=${project}_keys,dst=/keys,readonly`,'--entrypoint','tar',imageIds.postgres,'-c','-f','-','-C','/keys','.']);
  keys=capture();if(keys.length>16*1024*1024)fail();fingerprint=keyFingerprint(keys);
  const after=parseAggregates(docker(psqlArgs(pg,aggregateSql)));
  if(!sameAggregates(aggregates,after))fail();
  unchanged();
  files={'database.dump':dump,'keys.tar':keys,...includeFiles};
  const certificatePublic=createPublicKey(createPrivateKey(files['includes/certificate-key.pem'])).export({type:'spki',format:'der'});
  if(certificatePublic.equals(createPublicKey(verifying.bytes).export({type:'spki',format:'der'})))fail();
  const signingBytes=signing.bytes;if(Object.values(files).some(b=>b.equals(signingBytes)))fail();
  const repeatedKeys=capture();if(repeatedKeys.length>16*1024*1024||keyFingerprint(repeatedKeys)!==fingerprint)fail();
  }finally{
   try{docker([...compose,'start','--wait','--wait-timeout','120','api','frontend'],{availability:true});audit(JSON.parse(docker(['inspect',...ids],{availability:true})));}
   catch{const error=Error('Backup refused: exact application restart or health audit failed; restore availability using the reviewed exact-project procedure.');error.code='NEXUS_BACKUP_AVAILABILITY';throw error;}
  }
  unchanged();
  const metadata=validateMetadata({version:2,recipientFingerprint,aggregates,created:nowFromName(n.artifact),project,commit,imageIds,images:{api:c.services.api.image,frontend:c.services.frontend.image,postgres:c.services.postgres.image},services:['api','frontend','migrate','postgres'],migrationCount:aggregates.migrations,keyFingerprint:fingerprint,inventory:Object.fromEntries(Object.entries(files).map(([name,data])=>[name,hash(data)]))},project);
  files['metadata.json']=Buffer.from(JSON.stringify(metadata));
  files['manifest.json']=Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(files).map(([name,data])=>[name,hash(data)]))));
  if(Object.values(files).reduce((sum,b)=>sum+512+Math.ceil(b.length/512)*512,1024)>maxArchiveBytes)fail();
  const tar=packTar(files);validatePlaintext(tar,metadata);
  unchanged();
  const encrypted=join(stage,n.artifact);
  run(config.age,['--encrypt','--recipients-file',snapshotRecipient,'--output',encrypted,'-'],{input:tar});
  unchanged();
  if(!lstatSync(encrypted).isFile()||lstatSync(encrypted).isSymbolicLink()||lstatSync(encrypted).size===0)fail();
  const ciphertext=readBoundedFile(encrypted,maxCiphertextBytes);
  const sidecar=join(stage,n.sidecar),meta=join(stage,n.metadata),signature=join(stage,n.signature);
  writeFileSync(sidecar,hash(ciphertext)+'  '+n.artifact+'\n',{mode:0o600,flag:'wx'});
  writeFileSync(meta,JSON.stringify(metadata)+'\n',{mode:0o600,flag:'wx'});
  writeFileSync(signature,signEnvelope(n.artifact,metadata,ciphertext,readFileSync(meta),signing.bytes),{mode:0o600,flag:'wx'});
  unchanged();
  unlinkSync(snapshotEnv);unlinkSync(snapshotRecipient);
  if(readdirSync(stage).sort().join('|')!==Object.values(n).sort().join('|'))fail();
  verifyEnvelope(stage,n.artifact,project,snapshotVerifier,recipientFingerprint);
  unchanged();
  // Metadata then signature are the last publication markers; only all four files complete a set.
  for(const [source,name] of [[encrypted,n.artifact],[sidecar,n.sidecar],[meta,n.metadata],[signature,n.signature]]){const target=join(config.output,name);publish(source,target,publication);published.push(target);}
  clean(stage);stage=undefined;
  verifyEnvelope(config.output,n.artifact,project,snapshotVerifier,recipientFingerprint);
  unchanged();
  unchanged();return n;
 }catch(error){
  if(['NEXUS_BACKUP_AVAILABILITY','NEXUS_PUBLICATION_CLEANUP','NEXUS_RECOVERY_CLEANUP'].includes(error.code))primary=error;
  else if(published.length){primary=Error('Published evidence preserved; inspect public quartet and exact-run private staging manually.');primary.code='NEXUS_PUBLICATION_CLEANUP';}
  else primary=Error('Recovery refused; inspect private recovery state.');
 }finally{
  let cleanupFailed=false;
  for(const p of (stage?[stage]:[]))try{clean(p);}catch{cleanupFailed=true;}
  if(cleanupFailed){
   if(primary?.code==='NEXUS_BACKUP_AVAILABILITY'){primary.cleanupUnverified=true;primary.message+=' Private staging cleanup also unverified; private recovery inspection required.';}
   else if(primary?.code!=='NEXUS_PUBLICATION_CLEANUP'){primary=Error('Sensitive cleanup unverified; private recovery inspection required.');primary.code='NEXUS_RECOVERY_CLEANUP';}
  }
 }
 if(primary)throw primary;
}
function nowFromName(name){return name.replace(/^nexus-backup-(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z\.tar\.age$/,'$1-$2-$3T$4:$5:$6Z');}
export function restoreVerify({project,root,backupConfig,restoreConfig,artifact,run=execute,pinnedConfig}){
 let stage;
 try{
  if(!/^nexus_s10_restore_[a-z0-9_]+$/.test(project))fail();
  const c=loadBackupConfig(backupConfig,root,{transportOnly:true}),restoreInput=snapshotInput(pinnedConfig?.original??restoreConfig,root),r=validateRestoreConfig(JSON.parse(pinnedConfig?readPinnedInput(pinnedConfig.path,maxIncludeBytes).toString('utf8'):restoreInput.bytes.toString('utf8')));
  c.age=externalPath(c.age,root);
  const identity=snapshotInput(r.identity,root),temp=externalPath(r.tempRoot,root,true);
  if(dirname(externalPath(artifact,root))!==realpathSync(c.output))fail();
  const {metadata,ciphertext}=verifyEnvelopeBytes(c.output,basename(artifact),r.sourceProject,c[recoverySnapshots].verificationKey.bytes,c.recipientFingerprint);
  stage=mkdtempSync(join(temp,'nexus_s10_restore_'));chmodSync(stage,0o700);
  // age cannot read both identity and ciphertext from stdin. Pipe the exact
  // private identity snapshot and use an exact-run ciphertext copy, never the
  // mutable original identity or verifier pathname.
  const encrypted=join(stage,'verified-ciphertext.age');writeFileSync(encrypted,ciphertext,{mode:0o400,flag:'wx'});chmodSync(encrypted,0o400);
  checkRecoveryInputs(c,root);recheckInput(identity,root);recheckInput(restoreInput,root);
  const plaintext=run(c.age,['--decrypt','--identity','-',encrypted],{input:identity.bytes});
  checkRecoveryInputs(c,root);recheckInput(identity,root);recheckInput(restoreInput,root);
  if(!readBoundedFile(encrypted,maxCiphertextBytes).equals(ciphertext))fail();
  unlinkSync(encrypted);
  if(!Buffer.isBuffer(plaintext)||plaintext.length>maxArchiveBytes)fail();
  const files=validatePlaintext(plaintext,metadata);
  restoreStack({project,root,stage,config:r,metadata,files,run});
 }catch(error){if(error.code==='NEXUS_RESTORE_CLEANUP'||error instanceof AggregateError&&error.errors.some(e=>e.code==='NEXUS_RESTORE_CLEANUP')){stage=undefined;throw error;}fail();}
 finally{if(stage)removePrivate(stage);}
}
