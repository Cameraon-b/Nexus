import {spawnSync} from 'node:child_process';
import {composeEnvironment} from './production-environment.mjs';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {acquireOperationLock,validateSecret,runMigration} from './production-operations.mjs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2), command=args.shift();
function option(key){const i=args.indexOf(key);return i<0?undefined:args[i+1];}
function refuse(message){throw new Error(message);}
let release;
try {
 const project=option('--project'), env=option('--config-file');
 if(!['validate','build','migrate','start','status','stop','destroy'].includes(command)) refuse('choose validate/build/migrate/start/status/stop/destroy');
 if(!project || !/^nexus_(prod|s8)_[a-z0-9_]+$/.test(project)) refuse('an explicit nexus_prod_* or nexus_s8_* project is required');
 if(!env) refuse('an explicit --config-file is required');
 if(command==='destroy' && option('--confirm-destroy')!==project) refuse('--confirm-destroy must equal the exact project; this deletes its volumes');
 if(['build','migrate','start','stop','destroy'].includes(command)) release=acquireOperationLock(project,env,join(root,'.local','production-locks'));
 const needsSecret=['validate','build','migrate','start'].includes(command);
 if(needsSecret){
  const raw=readFileSync(env,'utf8').match(/^NEXUS_SECRET_FILE\s*=\s*(.+)$/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/,'$2');
  validateSecret(raw,root);
 }
 const compose=['compose','--project-name',project,'--env-file',env,'-f','deployment/compose.production.yaml'];
 function run(extra,capture=false){
  const r=spawnSync('docker',[...compose,...extra],{cwd:root,encoding:'utf8',stdio:capture?'pipe':'inherit',env:composeEnvironment()});
  if(r.status!==0) refuse('Docker operation failed; check configuration, permissions and service health');
  return r.stdout;
 }
 // Never emit resolved configuration: even sanitized configuration may gain sensitive fields later.
 const c=JSON.parse(run(['config','--format','json'],true));
 const secret=c.secrets?.database_password?.file;
 if(needsSecret) validateSecret(secret,root);
 if(!/^nexus-api:[a-f0-9]{40}$/.test(c.services.api.image)) refuse('NEXUS_COMMIT must be a full Git SHA');
 if(command==='validate') console.log('Production configuration valid; secret value not displayed.');
 if(command==='build') {
  const git=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});
  if(c.services.api.image!==`nexus-api:${git.stdout.trim()}`) refuse('build tag must equal current Git HEAD');
  const dirty=spawnSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).stdout.trim();
  if(dirty&&!args.includes('--allow-dirty')) refuse('working tree is dirty; review it or explicitly use --allow-dirty for disposable acceptance only');
  run(['build','--pull=false']);
 }
 if(command==='migrate'||command==='start'){
  runMigration(run,command==='start');
 }
 if(command==='status')run(['ps','--all','--format','json']);
 if(command==='stop')run(['stop']); // Deliberately never down -v.
 if(command==='destroy')run(['down','--volumes','--remove-orphans']);
} catch(error) {
 if(error.code==='NEXUS_OPERATION_LOCKED') console.error('Production operation refused: operation lock is held. Do not steal stale locks; follow deployment/README.md recovery verification.');
 else console.error('Production operation refused: invalid arguments/configuration, missing secret, or failed Docker operation. No credentials displayed.');
 process.exitCode=1;
} finally { release?.(); }
