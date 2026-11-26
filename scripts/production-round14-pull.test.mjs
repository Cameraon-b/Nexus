import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnNodeSync} from './fixtures/spawn-node.mjs';
import {candidateCommand} from './production-candidate.mjs';
import {candidateCustody} from './production-candidate-custody.mjs';
import {relaxFixture,removeFixture,privateCustody} from './fixtures/operation-candidate.mjs';
import {testPublicKey} from './fixtures/signing.mjs';
for(const drift of [false,true])test('round14 pull CLI '+(drift?'refuses candidate drift before SSH/lock/notify':'authenticated control reaches synthetic SSH'),()=>{
 const d=mkdtempSync(join(resolve('artifacts'),'nexus-r14-pull-'));privateCustody(d);
 try{
  const id=candidateCommand(['construct','--source',resolve('.'),'--custody',d]),root=join(d,'tools/candidates',id);
  const destination=join(d,'backups');mkdirSync(destination);const key=join(d,'key'),verifier=join(d,'verifier');writeFileSync(key,'synthetic',{mode:0o600});writeFileSync(verifier,testPublicKey,{mode:0o600});
  if(drift){relaxFixture(root);writeFileSync(join(root,'deployment/compose.production.yaml'),'in-place drift');candidateCustody(root,{install:true});}
  const r=spawnNodeSync(['--import',new URL('./fixtures/pull-auth-preload.mjs',import.meta.url).href,join(root,'scripts/pull-production-backup.mjs'),'--host','example.invalid','--user','nexus','--key',key,'--verification-key',verifier,'--recipient-fingerprint','a'.repeat(64),'--remote','/backups','--destination',destination,'--project','nexus_prod_r14pull','--daily','3','--weekly','2','--monthly','3'],{encoding:'utf8',timeout:30000});
  assert.equal(r.status,1);assert.doesNotMatch(r.stdout,/retention complete|Off-host backup verified/);
  if(drift){assert.doesNotMatch(r.stdout,/NEXUS_TEST_SSH_CALLED/);assert.equal(existsSync(join(destination,'.nexus_s10_pull.lock')),false);}
  else assert.match(r.stdout,/NEXUS_TEST_SSH_CALLED/);
 }finally{removeFixture(d,{recursive:true,force:true});}
});
