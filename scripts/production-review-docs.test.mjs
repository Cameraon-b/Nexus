import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('review: scheduler uses explicitly reviewed immutable release and shared private layout',()=>{
 const service=readFileSync(new URL('../deployment/nexus-backup.service.example',import.meta.url),'utf8');assert.ok(service.includes('/srv/nexus/shared/tools/candidates/'+'0'.repeat(64)+'/scripts/production.mjs'));assert.ok(service.includes('/srv/nexus/shared/production.env'));assert.ok(!service.includes('/srv/nexus/scripts'));
 const cli=readFileSync(new URL('./production.mjs',import.meta.url),'utf8');assert.ok(cli.includes('operationFailureLines(error)'));
 const outcomes=readFileSync(new URL('./production-operation-outcome.mjs',import.meta.url),'utf8');assert.ok(outcomes.includes("case 'NEXUS_BACKUP_AVAILABILITY'"));
 assert.ok(service.includes('Round 14 is repository-only; checks and fresh review pending, not deployment acceptance'));
 assert.ok(service.includes('Fresh independent review/rebuilt candidate/live producer and restore remain pending'));
 assert.ok(service.includes('Environment=PATH=/usr/bin:/bin'));
 assert.ok(service.includes('ExecStartPre=/usr/bin/python3 -I'));
 for(const file of ['deployment/README.md','docs/Sprint_10_Production_Trust_Recovery.md']){
  const doc=readFileSync(new URL('../'+file,import.meta.url),'utf8');
  for(const term of ['python3','abstract Unix socket','same-UID','fresh independent review/rebuilt candidate/live producer and restore remain pending'])assert.ok(doc.includes(term),file+': '+term);
 }
 const config=JSON.parse(readFileSync(new URL('../deployment/backup.env.example',import.meta.url)));assert.ok(config.signingKey);assert.ok(config.verificationKey);
 const pull=readFileSync(new URL('../deployment/pull-backup.ps1.example',import.meta.url),'utf8');assert.ok(pull.includes('--verification-key'));
});
