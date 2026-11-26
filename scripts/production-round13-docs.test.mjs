import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('round13 timer precision and restore config custody are explicit',()=>{
 const timer=readFileSync('deployment/nexus-backup.timer.example','utf8');assert.match(timer,/^AccuracySec=1s$/m);
 const readme=readFileSync('deployment/README.md','utf8');assert.doesNotMatch(readme,/--restore-config \/srv\/restore-private\/restore\.json/);assert.match(readme,/--restore-config \/srv\/nexus\/shared\/config\/restore\.json/);
});
test('round13 sprint log has no stale current/timer or executable manual operation-lock deletion prose',()=>{
 const doc=readFileSync('docs/Sprint_10_Production_Trust_Recovery.md','utf8');
 assert.doesNotMatch(doc,/still illustrates 02:00 UTC with five-minute randomization|Current implementation is Round 11|Stale recovery remains manual|before removing only that approved exact lock|remove only approved exact state|manual exclusive recovery must inspect/);
});
