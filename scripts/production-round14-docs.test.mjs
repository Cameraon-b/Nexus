import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const files=['README.md','backend/README.md','deployment/README.md','deployment/nexus-backup.service.example','docs/Sprint_10_Production_Trust_Recovery.md'];
for(const path of files)test('round14 current status and historical review boundary: '+path,()=>{
 const doc=readFileSync(path,'utf8');assert.match(doc,/Round[ -]14/);
 assert.doesNotMatch(doc,/current uncommitted Round-12|Current Round 12 is repository-only|Current implementation is \*\*Round 12|current Sprint-10 Round-12|Round 13 remains not accepted|Round 12 is repository-only, not deployment acceptance/);
 assert.match(doc,/Cameron accepted Sprint 10 on November 25, 2026|Sprint 10 is now owner-accepted and published to local main\/Gitea/);
 assert.doesNotMatch(doc,/Cameron acceptance and Git integration remain pending|Sprint 10 remains uncommitted/);
});
test('round14 public lifecycle procedure and transfer boundary',()=>{
 const doc=readFileSync('deployment/README.md','utf8');
 for(const anchor of ['production-candidate.mjs construct','production-candidate.mjs verify','production-candidate.mjs package','production-candidate.mjs install','closed allowlist','separately pinned','Round 14'])assert.ok(doc.includes(anchor),anchor);
});
