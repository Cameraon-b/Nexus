import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('round3: cited source ranges include corrected semantic anchors (not a proof of prose)',()=>{
 const doc=read('docs/Sprint_10_Production_Trust_Recovery.md');
 const cited=(file,anchors)=>{
  const source=read(file).split('\n');
  const ranges=[...doc.matchAll(/`([^`\s]+):(\d+)-(\d+)`/g)].filter(m=>m[1]===file).map(m=>source.slice(Number(m[2])-1,Number(m[3])).join('\n'));
  assert.ok(ranges.some(text=>anchors.every(a=>text.includes(a))),file+': '+anchors.join(', '));
 };
 cited('deployment/compose.production.yaml',['  api:','  frontend:','        condition: service_healthy']);
 cited('scripts/pull-production-backup.mjs',["const security=['-o','BatchMode=yes'",'StrictHostKeyChecking=yes','const bytes=await guarded(()=>list(','await guarded(()=>transfer([...security']);
 cited('scripts/production-envelope.mjs',['maxCiphertextBytes=513*1024*1024','sidecar:256,metadata:16*1024,signature:4*1024']);
 cited('scripts/pull-production-backup.mjs',['maxVerifiedAgeMs=36*60*60*1000','futureSkewMs=10*60*1000']);
 cited('scripts/production-restore.test.mjs',["req.headers.host!=='localhost'","mode==='redirect'?302:200","mode==='html'?'text/html':'application/json'","for(mode of ['redirect','html'])await assert.rejects(run)"]);
 cited('scripts/production.mjs',['finally { await finishOperation(primary,release); }','if(success)console.log(success)','operationFailureLines(error)']);
 cited('scripts/production-operation-outcome.mjs',['AggregateError','NEXUS_OPERATION_LOCK_CLEANUP','NEXUS_BACKUP_AVAILABILITY','NEXUS_RESTORE_CLEANUP']);
 cited('scripts/production-envelope.mjs',['authenticateEnvelope(','m.recipientFingerprint!==recipientFingerprint','return {metadata:m,ciphertext:encrypted,members,retirementMembers,descriptors}']);
 cited('scripts/pull-production-backup.mjs',['verifyEnvelope(stage,','const existing=','publish(','Published evidence preserved;','for(const name of names){check();removePrivate']);
 cited('scripts/pull-production-backup.mjs',['export function selectRetention','return keep']);
 cited('scripts/pull-production-backup.mjs',['const verified=records()','age>maxVerifiedAgeMs','verifyEnvelopeBytes(destination,record.artifact','if(notify)']);
 cited('scripts/pull-production-backup.mjs',['new URL(c.pushUrl)','redirect:\'error\'']);
 cited('scripts/production-restore.mjs',['writeFileSync(env,','writeFileSync(pinned,']);
 cited('scripts/production-restore.mjs',['if(config==null)return []','validateRestoreConfig(r,existing)']);
 cited('scripts/production-restore.mjs',['frontendProbe,new URL','if(fingerprint()!==m.keyFingerprint)']);
});
test('round3: public examples fail closed and explain independent pin/rotation compatibility',()=>{
 const example=JSON.parse(read('deployment/backup.env.example'));assert.equal(example.recipientFingerprint,'<APPROVED_RECIPIENT_BYTES_SHA256>');
 const ps=read('deployment/pull-backup.ps1.example');assert.ok(ps.includes("$recipientFingerprint -cnotmatch '^[0-9a-f]{64}$'"));assert.ok(ps.includes('--recipient-fingerprint $recipientFingerprint'));
 for(const file of ['deployment/README.md','docs/Sprint_10_Production_Trust_Recovery.md']){
  const text=read(file);for(const term of ['recipientFingerprint','--recipient-fingerprint <64-lowercase-hex>','coordinated rotation','historical fingerprint/identity configuration','All version-2 artifacts','no inferred defaults','Never auto-trust a fingerprint delivered only in the quartet'])assert.ok(text.includes(term),file+': '+term);
 }
});
