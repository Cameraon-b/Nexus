import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,cpSync,writeFileSync,readFileSync,readdirSync,chmodSync,existsSync,symlinkSync,utimesSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {acquireOperationLock,operationLockRoot} from './production-operations.mjs';
import {privateCustody,operationCandidate,sealCandidate,removeFixture as rmSync} from './fixtures/operation-candidate.mjs';
import {testPublicKey} from './fixtures/signing.mjs';
const preload=new URL('./fixtures/external-lock-preload.mjs',import.meta.url).href;
const lockName=p=>createHash('sha256').update(p).digest('hex')+'.lock';
async function fixture(fn){const d=mkdtempSync(join(tmpdir(),'nexus-r9-'));try{privateCustody(d);await fn(d);}finally{rmSync(d,{recursive:true,force:true});}}
function snapshot(root){return readdirSync(root,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).map(e=>[e.name,e.isDirectory()?snapshot(join(root,e.name)):createHash('sha256').update(readFileSync(join(root,e.name))).digest('hex')]);}
function custody(root,writable){
 if(process.platform==='win32'){
  const user=spawnSync('whoami.exe',[],{encoding:'utf8'}).stdout.trim();
  const inheritance=spawnSync('icacls.exe',[root,'/inheritance:r'],{encoding:'utf8'});assert.equal(inheritance.status,0,inheritance.stderr);
  const r=spawnSync('icacls.exe',[root,'/grant:r',`${user}:${writable?'F':'RX'}`,'/T','/Q'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 }else{for(const e of readdirSync(root,{withFileTypes:true})){const p=join(root,e.name);if(e.isDirectory())custody(p,writable);else chmodSync(p,writable?0o600:0o400);}chmodSync(root,writable?0o700:0o500);}
}
test('round9: read/execute-only copied candidates reach injected decrypt; external locks release on success/failure without changing candidate bytes',()=>fixture(async d=>{
 const config=join(d,'restore.json'),age=join(d,'age'),identity=join(d,'identity'),artifact=join(d,'artifact');
 for(const p of [age,identity,artifact])writeFileSync(p,'synthetic');
 writeFileSync(config,JSON.stringify({identity,tempRoot:d,sourceProject:'nexus_prod_example'}));
 const alternate=join(d,'alternate-private');mkdirSync(alternate);const alternateConfig=join(alternate,'restore.json');writeFileSync(alternateConfig,readFileSync(config));
 const verificationKey=join(d,'verifier');writeFileSync(verificationKey,testPublicKey);
 const backupConfig=join(d,'backup.json');writeFileSync(backupConfig,JSON.stringify({output:d,recipient:age,recipientFingerprint:'a'.repeat(64),age,signingKey:join(d,'absent'),verificationKey,includes:['production.env','database-password','certificate.pem','certificate-key.pem','npm-current.json','npm-rollback.json'].map(name=>({name,source:age}))}));
 mkdirSync(join(d,'tools','candidates'),{recursive:true});
 const project='nexus_s10_restore_round9';
 for(const version of ['candidate-a','candidate-b']){
  let root=join(d,'tools','candidates',version);mkdirSync(root);cpSync(resolve('scripts'),join(root,'scripts'),{recursive:true});writeFileSync(join(root,'package.json'),JSON.stringify({type:'module',syntheticVersion:version}));root=sealCandidate(root);const before=snapshot(root);
  custody(root,false);
  try{
   assert.throws(()=>writeFileSync(join(root,'custody-write-probe'),'must refuse'));
   const invoke=(fail,selectedConfig=config)=>spawnSync(process.execPath,['--import',preload,join(root,'scripts/production.mjs'),'restore-verify','--project',project,'--restore-config',selectedConfig,'--backup-config',backupConfig,'--artifact',artifact,'--confirm-disposable',project],{encoding:'utf8',env:{...process.env,NEXUS_TEST_CONFIG:config,NEXUS_TEST_CANDIDATE:root,NEXUS_TEST_FAIL:fail?'1':''}});
   for(const fail of [false,true]){const r=invoke(fail);assert.match(r.stdout,/INJECTED_AGE_DECRYPT_BOUNDARY/,r.stderr);assert.equal(r.status,fail?1:0,r.stderr);assert.equal(existsSync(join(root,'.local')),false);assert.deepEqual(readdirSync(join(d,'.nexus-production-locks')),[]);assert.deepEqual(snapshot(root),before);}
   const release=await acquireOperationLock(project,config,operationLockRoot(config,root));
   try{const r=invoke(false,alternateConfig);assert.equal(r.status,1);assert.match(r.stderr,/operation lock is held/);assert.doesNotMatch(r.stdout,/DECRYPT/);}finally{await release();}
   // Both versions and every lifecycle mutation must observe the same
   // external project owner, before any Docker/backup work can run.
   const mutationProject='nexus_prod_round9_upgrade';
   const owner=await acquireOperationLock(mutationProject,config,operationLockRoot(config,root));
   try{for(const command of ['backup','build','migrate','start','stop','destroy']){
    const r=spawnSync(process.execPath,[join(root,'scripts/production.mjs'),command,'--project',mutationProject,'--config-file',alternateConfig,...(command==='backup'?['--backup-config',backupConfig]:[]),...(command==='destroy'?['--confirm-destroy',mutationProject]:[])],{encoding:'utf8'});
    assert.equal(r.status,1);assert.match(r.stderr,/operation lock is held/);
   }}finally{await owner();}
   assert.deepEqual(snapshot(root),before);
  }finally{custody(root,true);}
 }
}));
for(const collision of ['file','junction','stale'])test('round9: CLI refuses unsafe external lock root or stale project lock: '+collision,()=>fixture(d=>{
 const {cli,root}=operationCandidate(d);
 const config=join(d,'config');writeFileSync(config,'{}');const locks=join(d,'.nexus-production-locks'),project='nexus_prod_round9';
 if(collision==='file')writeFileSync(locks,'collision');
 if(collision==='junction'){const target=join(d,'target');mkdirSync(target);symlinkSync(target,locks,'junction');}
 if(collision==='stale'){mkdirSync(locks,{mode:0o700});mkdirSync(join(locks,lockName(project)));utimesSync(join(locks,lockName(project)),new Date(0),new Date(0));}
 const before=snapshot(collision==='junction'?join(d,'target'):d);
 if(collision!=='stale')assert.throws(()=>operationLockRoot(config,root));
 for(const command of ['backup','build','migrate','start','stop','destroy']){
  const r=spawnSync(process.execPath,[cli,command,'--project',project,'--config-file',config,...(command==='backup'?['--backup-config',join(d,'absent')]:[]),...(command==='destroy'?['--confirm-destroy',project]:[])],{encoding:'utf8'});
  assert.equal(r.status,1);assert.equal(r.stdout,'');if(collision==='stale')assert.match(r.stderr,/operation lock is held/);
 }
 assert.deepEqual(snapshot(collision==='junction'?join(d,'target'):d),before);
}));
