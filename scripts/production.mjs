import {recoverySnapshots} from './production-input-snapshot.mjs';
import {spawnSync} from 'node:child_process';
import {checkedStep} from './production-resident-lock.mjs';
import {parseLifecycleOptions} from './production-lifecycle-options.mjs';
import {recoverCustodyLock} from './production-lock-custody.mjs';
import {finishOperation,operationFailureLines} from './production-operation-outcome.mjs';
import {composeEnvironment} from './production-environment.mjs';
import {readFileSync} from 'node:fs';
import {acquireOperationLock,operationLockRoot,validateSecret,runMigration} from './production-operations.mjs';
import {fileURLToPath} from 'node:url';
import {parseRecoveryOptions,backup,restoreVerify,execute} from './production-backup.mjs';
import {loadBackupConfig,externalPath} from './production-recovery.mjs';
import {verifyEnvelope} from './production-envelope.mjs';
import {basename,dirname} from 'node:path';
let root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2), command=args.shift();
function refuse(message){throw new Error(message);}
let release,success,primary;
const externalStep=(...args)=>checkedStep(release,()=>spawnSync(...args));
const recoveryStep=(...args)=>checkedStep(release,()=>execute(...args));
try {
 try {
 if(['backup','verify-backup','restore-verify'].includes(command)){
  const o=parseRecoveryOptions(command,args);
  const lockConfig=externalPath(command==='restore-verify'?o.restoreConfig:o.env,root);
  if(command!=='verify-backup')release=await acquireOperationLock(o.project,lockConfig,operationLockRoot(lockConfig,root));
  const pinnedConfig=release?.inputs&&{original:lockConfig,path:release.inputs.config};
  if(release?.inputs)root=release.inputs.candidate;
  if(command==='backup')backup({...o,root,run:recoveryStep,pinnedConfig});
  if(command==='verify-backup'){
   const c=loadBackupConfig(o.backupConfig,root,{transportOnly:true}),artifact=externalPath(o.artifact,root);
   if(dirname(artifact)!==c.output)refuse('invalid artifact');
   verifyEnvelope(c.output,basename(artifact),o.project,c[recoverySnapshots].verificationKey.bytes,c.recipientFingerprint);
  }
  if(command==='restore-verify')restoreVerify({...o,root,run:recoveryStep,pinnedConfig});
  success='Recovery operation verified; no private configuration displayed.';
 }else{
 let {project,env,allowDirty}=parseLifecycleOptions(command,args);
 if(command==='recover-operation-lock'){
  const config=externalPath(env,root);
  const result=await recoverCustodyLock(project,config,operationLockRoot(config,root));
  success=result==='absent'?'Operation lock already absent; no state removed.':'Operation lock recovery verified.';
 }else{
 if(['build','migrate','start','stop','destroy'].includes(command)){
  const lockConfig=externalPath(env,root);
  release=await acquireOperationLock(project,lockConfig,operationLockRoot(lockConfig,root));
  if(release.inputs){root=release.inputs.candidate;env=release.inputs.config;}
 }
 const needsSecret=['validate','build','migrate','start'].includes(command);
 if(needsSecret){
  const raw=readFileSync(env,'utf8').match(/^NEXUS_SECRET_FILE\s*=\s*(.+)$/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/,'$2');
  validateSecret(raw,root);
 }
 const compose=['compose','--project-name',project,'--env-file',env,'-f','deployment/compose.production.yaml'];
 function run(extra,capture=false){
  const r=externalStep('docker',[...compose,...extra],{cwd:root,encoding:'utf8',stdio:capture?'pipe':'inherit',env:composeEnvironment()});
  if(r.status!==0) refuse('Docker operation failed; check configuration, permissions and service health');
  return r.stdout;
 }
 // Never emit resolved configuration: even sanitized configuration may gain sensitive fields later.
 const c=JSON.parse(run(['config','--format','json'],true));
 const secret=c.secrets?.database_password?.file;
 if(needsSecret) validateSecret(secret,root);
 if(!/^nexus-api:[a-f0-9]{40}$/.test(c.services.api.image)) refuse('NEXUS_COMMIT must be a full Git SHA');
 if(command==='validate') success='Production configuration valid; secret value not displayed.';
 if(command==='build') {
  const git=externalStep('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});
  if(c.services.api.image!==`nexus-api:${git.stdout.trim()}`) refuse('build tag must equal current Git HEAD');
  const dirty=externalStep('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).stdout.trim();
  if(dirty&&!allowDirty) refuse('working tree is dirty; review it or explicitly use --allow-dirty for disposable acceptance only');
  run(['build','--pull=false']);
 }
 if(command==='migrate'||command==='start'){
  runMigration(run,command==='start');
 }
 if(command==='status')run(['ps','--all','--format','json']);
 if(command==='stop')run(['stop']); // Deliberately never down -v.
 if(command==='destroy')run(['down','--volumes','--remove-orphans']);
 }
 }
 } catch(error) { primary=error; } finally { await finishOperation(primary,release); }
 if(success)console.log(success);
} catch(error) {
 for(const line of operationFailureLines(error))console.error(line);
 process.exitCode=1;
}
