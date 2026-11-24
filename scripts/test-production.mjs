import {spawn,spawnSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,mkdirSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {composeEnvironment} from './production-environment.mjs';
import {allocateSubnets,cleanupAcceptance,auditRuntime} from './production-acceptance-safety.mjs';
import {acceptanceEnvironment,tlsOverlay} from './production-acceptance-config.mjs';
import assert from 'node:assert/strict';
const project=`nexus_s8_${randomBytes(6).toString('hex')}`;
const dir=mkdtempSync(join(tmpdir(),'nexus-s8-'));
const envFile=join(dir,'production.env'),overlay=join(dir,'tls.json'),tlsDir=join(dir,'tls');
mkdirSync(tlsDir);
const commit=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();
const port=async()=>{const s=createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p;};
function run(cmd,args,capture=false){const r=spawnSync(cmd,args,{encoding:'utf8',stdio:capture?'pipe':'inherit',timeout:180000,env:cmd==='docker'?composeEnvironment():process.env});if(r.status!==0)throw new Error(`${cmd} operation failed (exit ${r.status})`);return capture==='combined'?r.stdout+r.stderr:r.stdout;}
const compose=['compose','-p',project,'--env-file',envFile,'-f','deployment/compose.production.yaml','-f',overlay];
let created=false;
try{
 const frontendPort=await port(),tlsPort=await port();
 // Select a pair of non-overlapping subnets not already attached to Docker resources.
 const existing=run('docker',['network','ls','-q'],true).trim().split(/\s+/).filter(Boolean);
 const networks=existing.length?JSON.parse(run('docker',['network','inspect',...existing],true)):[];
 const octet=allocateSubnets(networks.flatMap(n=>(n.IPAM?.Config??[]).map(c=>c.Subnet).filter(Boolean)));
 writeFileSync(join(dir,'database-password'),randomBytes(48).toString('base64url'),{mode:0o444}); // Parent mkdtemp directory is private; non-root container readers need file access.
 writeFileSync(envFile,acceptanceEnvironment({commit,dir,octet,frontendPort}));
 run('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(tlsDir,'key.pem'),'-out',join(tlsDir,'cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'],true);
 // File-secret bind mounts preserve host permissions on Linux. Keep the parent private,
 // but allow the unprivileged TLS worker to read its mounted ephemeral key.
 chmodSync(join(tlsDir,'key.pem'),0o444);
 writeFileSync(join(tlsDir,'tls.conf'),`pid /tmp/nginx.pid; events {} http { access_log off; client_body_temp_path /tmp/client; proxy_temp_path /tmp/proxy; fastcgi_temp_path /tmp/fastcgi; uwsgi_temp_path /tmp/uwsgi; scgi_temp_path /tmp/scgi; server { listen 8443 ssl; ssl_certificate /accept/cert.pem; ssl_certificate_key /accept/key.pem; location / { proxy_pass http://frontend:8080; proxy_set_header Host localhost; proxy_set_header X-Forwarded-Proto https; proxy_set_header X-Forwarded-For $remote_addr; } } }`);
 writeFileSync(overlay,JSON.stringify(tlsOverlay({tlsDir,tlsPort,octet})));
 console.log(`Acceptance project ${project}; frontend ${frontendPort}; HTTPS ${tlsPort}; image base commit ${commit}; working tree is uncommitted.`);
 mkdirSync('artifacts/s8',{recursive:true});writeFileSync('artifacts/s8/r4-acceptance-project.txt',`${project}\n`);
 created=true;
 run(process.execPath,['scripts/production.mjs','validate','--project',project,'--config-file',envFile]);
 run(process.execPath,['scripts/production.mjs','build','--project',project,'--config-file',envFile,'--allow-dirty']);
 const startup=run(process.execPath,['scripts/production.mjs','start','--project',project,'--config-file',envFile],'combined');
 assert.ok(!startup.includes('libgssapi'),'password-file deployment must not probe an unavailable Kerberos runtime');
 assert.ok(!startup.includes(readFileSync(join(dir,'database-password'),'utf8')));
 console.log(startup);
 const networkIds=()=>run('docker',['network','inspect',`${project}_backend`,`${project}_edge`,'--format','{{.Id}}'],true);
 const baseIds=run('docker',[...compose,'ps','--all','-q'],true).trim().split(/\s+/).filter(Boolean);
 auditRuntime(JSON.parse(run('docker',['inspect',...baseIds],true)),'127.0.0.1',{project,frontendPort,secretFile:join(dir,'database-password')});
 const beforeTls=networkIds();
 const frontendId=run('docker',[...compose,'ps','-q','frontend'],true);
 try { run('docker',[...compose,'up','--no-deps','--pull','never','-d','--wait','--wait-timeout','30','tls']); }
 catch(error) { console.error(run('docker',[...compose,'logs','--no-log-prefix','tls'],true)); throw error; }
 assert.equal(networkIds(),beforeTls,'TLS overlay must preserve the live network IDs');
 assert.equal(run('docker',[...compose,'ps','-q','frontend'],true),frontendId,'TLS must not recreate frontend');
 const child=spawn(process.execPath,['node_modules/playwright/cli.js','test','--config','playwright.production.config.ts'],{stdio:'inherit',env:{...process.env,NEXUS_ACCEPT_PROJECT:project,NEXUS_ACCEPT_ENV:envFile,NEXUS_ACCEPT_URL:`https://localhost:${tlsPort}`,PLAYWRIGHT_BROWSERS_PATH:join(process.cwd(),'.browsers')}});
 const [code]=await once(child,'exit');if(code!==0)throw new Error('HTTPS production browser acceptance failed');
 run('docker',[...compose,'up','--no-deps','--no-recreate','--pull','never','-d','--wait','--wait-timeout','60','api','frontend','postgres','tls']);
 const status=run(process.execPath,['scripts/production.mjs','status','--project',project,'--config-file',envFile],true);
 assert.ok(status.includes(`nexus-api:${commit}`)&&status.includes('healthy'));
 writeFileSync('artifacts/s8/r4-status.json',status);
 const ids=run('docker',[...compose,'ps','--all','-q'],true).trim().split(/\s+/).filter(Boolean);
 const inspections=JSON.parse(run('docker',['inspect',...ids],true));
 const audit=inspections.map(c=>({name:c.Name,service:c.Config.Labels['com.docker.compose.service'],user:c.Config.User,health:c.State.Health?.Status,state:c.State.Status,mounts:c.Mounts.map(m=>({type:m.Type,destination:m.Destination,writable:m.RW})),ports:c.HostConfig.PortBindings,readOnly:c.HostConfig.ReadonlyRootfs,tmpfs:c.HostConfig.Tmpfs,security:c.HostConfig.SecurityOpt}));
 auditRuntime(inspections,'127.0.0.1',{project,frontendPort,secretFile:join(dir,'database-password'),tlsPort,tlsDirectory:tlsDir});
 const secret=readFileSync(join(dir,'database-password'),'utf8');
 assert.ok(!JSON.stringify(inspections).includes(secret),'secret must not be present in container environment/config');
 for(const c of inspections){
  assert.equal(c.HostConfig.Privileged,false);
  assert.notEqual(c.HostConfig.NetworkMode,'host');
  assert.ok(c.HostConfig.SecurityOpt.includes('no-new-privileges:true'));
  assert.ok(!c.Mounts.some(m=>(m.Type==='bind'&&m.Source.replaceAll('\\','/').toLowerCase().includes('/nexus/.local'))||m.Destination.includes('docker.sock')));
  const history=run('docker',['history','--no-trunc',c.Image],true);
  assert.ok(!history.includes(secret),'secret must not be present in image history');
 }
 writeFileSync('artifacts/s8/r4-runtime-audit.json',JSON.stringify(audit,null,2));
 const stateSnapshot=()=>({
  counts:run('docker',[...compose,'exec','-T','postgres','psql','-U','nexus','-d','nexus','-At','-c','SELECT (SELECT count(*) FROM "Accounts"), (SELECT count(*) FROM "Messages"), (SELECT count(*) FROM "IntegrationTokens"), (SELECT count(*) FROM "MessageDrafts"), (SELECT count(*) FROM "ApprovalDecisions"), (SELECT count(*) FROM "__EFMigrationsHistory");'],true).trim(),
  keys:createHash('sha256').update(run('docker',[...compose,'exec','-T','api','sh','-ec','sha256sum /keys/*'],true)).digest('hex')
 });
 const beforeStop=stateSnapshot();
 assert.ok(beforeStop.counts.startsWith('1|'));
 // Update a running stack: the CLI must stop traffic/API, migrate, then restart.
 const since=new Date(Date.now()-1000).toISOString();
 run(process.execPath,['scripts/production.mjs','start','--project',project,'--config-file',envFile]);
 assert.deepEqual(stateSnapshot(),beforeStop,'running-stack update preserves records and key files');
 const until=new Date(Date.now()+1000).toISOString();
 const events=run('docker',['events','--since',since,'--until',until,'--filter',`label=com.docker.compose.project=${project}`,'--format','{{json .}}'],true).trim().split('\n').filter(Boolean).map(JSON.parse);
 const eventIndex=(service,action)=>events.findIndex(e=>e.Actor?.Attributes?.['com.docker.compose.service']===service&&e.Action===action);
 const migrationStart=eventIndex('migrate','start'),migrationEnd=eventIndex('migrate','die');
 assert.ok(migrationStart>=0&&migrationEnd>migrationStart);
 for(const service of ['api','frontend']){
  assert.ok(eventIndex(service,'die')>=0&&eventIndex(service,'die')<migrationStart,`${service} must stop before migration`);
  assert.ok(eventIndex(service,'start')>migrationEnd,`${service} must start after migration exits`);
 }
 writeFileSync('artifacts/s8/r4-update-events.json',JSON.stringify(events,null,2));
 run(process.execPath,['scripts/production.mjs','stop','--project',project,'--config-file',envFile]);
 const volumes=run('docker',['volume','ls','--filter',`label=com.docker.compose.project=${project}`,'-q'],true).trim().split(/\s+/);assert.equal(volumes.length,2);
 run(process.execPath,['scripts/production.mjs','start','--project',project,'--config-file',envFile]);
 assert.deepEqual(stateSnapshot(),beforeStop,'stop/start must preserve database records and exact key files');
 console.log('HTTPS journey, restart persistence, runtime inspections and non-destructive stop/start data/key preservation passed.');
}catch(e){console.error(e.message);process.exitCode=1;}
finally{
 const cleaned=cleanupAcceptance({dir,project,
  destroy:()=>{if(created)run(process.execPath,['scripts/production.mjs','destroy','--project',project,'--config-file',envFile,'--confirm-destroy',project]);},
  query:(kind,args)=>run('docker',[kind,'ls',...args],true)
 });
 if(!cleaned)process.exitCode=1;
}
