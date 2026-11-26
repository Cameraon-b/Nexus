import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('round2: Windows pull requires reviewed SHA256 candidate, rejects placeholders and preserves exit',()=>{
 const p=read('deployment/pull-backup.ps1.example');
 assert.ok(!p.includes('C:\\Nexus\\scripts'));
 assert.ok(!p.includes('C:\\NexusReleases'));
 assert.ok(p.includes('C:\\Nexus Backup\\tools\\candidates\\'));
 assert.ok(p.includes('<REVIEWED_CANDIDATE_SHA256>'));
 assert.ok(p.includes("'^[0-9a-f]{64}$'"));
 assert.ok(p.includes("$expected = 'C:\\Nexus Backup\\tools\\candidates\\' + $candidateId"));
 assert.ok(p.includes('$candidate -cne $expected'));
 assert.ok(p.includes('[System.IO.Path]::GetFullPath($candidate) -cne $expected'));
 assert.ok(p.includes('$candidateId -cnotmatch'));
 assert.ok(p.includes('[System.IO.Path]::GetFullPath'));
 assert.ok(p.includes('ReparsePoint'));
 assert.ok(p.includes("Join-Path $candidate 'scripts\\pull-production-backup.mjs'"));
 assert.ok(p.includes('Get-Item -LiteralPath $path -Force'));
 assert.ok(p.includes('immutable custody'));
 assert.ok(p.includes('exit $LASTEXITCODE'));
 assert.ok(!/after Nora backup/i.test(p));
});
test('round2: current schedule and six-monitor proof boundaries are explicit',()=>{
 const sprint=read('docs/Sprint_10_Production_Trust_Recovery.md'),deployment=read('deployment/README.md');
 for(const doc of [sprint,deployment]){
  assert.ok(doc.includes('C:\\Nexus Backup\\tools\\candidates\\<REVIEWED_CANDIDATE_SHA256>'));
  assert.ok(!doc.includes('C:\\NexusReleases'));
  for(const term of ['09:00 UTC','08:00 UTC','CST','CDT','Persistent=true','zero-transfer','36 hours','65','Nexus Backup Generation & Timer','26 hours','ExecMainStatus=0','Result=success','capacity/size','window-duration'])assert.ok(doc.includes(term),term);
  assert.ok(!doc.includes('Hermes will add'));
  assert.ok(doc.includes('tracked-file whitespace'));
 }
 for(const doc of [sprint,deployment]){
  assert.ok(doc.includes('Round 5'));
  assert.ok(doc.includes('no Round-5 candidate is live'));
  assert.ok(doc.includes('Round-8 independent review passed all three specialist gates'));
  assert.ok(doc.includes('no final candidate, live migration, or new restore has occurred'));
 }
 const steps=deployment.slice(deployment.indexOf('### Ordered installation migration'),deployment.indexOf('### Private configuration and encryption'));
 for(const [index,anchor] of ['Compute the SHA-256','Before switching service/task/wrappers','Only after configuration validation','Generate a fresh signed encrypted backup'].entries())assert.ok(steps.includes(`${index+1}. `)&&steps.includes(anchor),anchor);
 assert.ok(steps.includes('Installing code first would fail closed at the next backup'));
 assert.match(deployment,/Round 5[^\n]*production/i);
 assert.match(sprint,/Six persistent monitors/);
 assert.match(sprint,/six persistent Uptime Kuma monitors/i);
});
