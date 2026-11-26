import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('round8: exact Windows identity reauthentication and best-effort rollback documented',()=>{
 for(const file of ['deployment/README.md','docs/Sprint_10_Production_Trust_Recovery.md']){
 const doc=readFileSync(new URL('../'+file,import.meta.url),'utf8');
 for(const term of ['Round 8','Historical Round 7','volume/file identity','BigInt','best-effort rollback','byte-identical replacement','Round-8 independent review passed all three specialist gates','no final candidate, live migration, or new restore has occurred'])assert.ok(doc.includes(term),file+': '+term);
 assert.doesNotMatch(doc,/replacement before (?:helper )?open fails hash/);
 }
});
