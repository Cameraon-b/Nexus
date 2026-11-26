import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
for(const file of ['deployment/README.md','docs/Sprint_10_Production_Trust_Recovery.md'])test('round9: external immutable-candidate custody and acceptance boundary: '+file,()=>{
 const doc=readFileSync(new URL('../'+file,import.meta.url),'utf8');
 for(const phrase of ['Round 9','.nexus-production-locks','SHA-256','canonical external','candidate upgrades','no passphrase was entered','no Docker restore resources were created','production/off-host data were unchanged','fresh full review','rebuilt candidate/live restore remain pending'])assert.ok(doc.includes(phrase),phrase);
 assert.doesNotMatch(doc,/Current implementation is (?:\*\*)?Round 8/);
 assert.doesNotMatch(doc,/under `\.local\/production-locks`/);
});
