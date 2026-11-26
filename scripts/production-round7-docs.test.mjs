import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('round7: current Windows handle retention, historical quarantine and review boundaries',()=>{
 for(const file of ['deployment/README.md','docs/Sprint_10_Production_Trust_Recovery.md']){
  const doc=read(file);for(const term of ['Round 7','Windows-only','CreateFileW','SetFileInformationByHandle','FILE_SHARE_READ','preexisting Round-6 quarantine','Round-8 independent review passed all three specialist gates','no final candidate, live migration, or new restore'])assert.ok(doc.includes(term),file+': '+term);
  assert.doesNotMatch(doc,/Automatic physical retirement (?:success )?(?:is|remains) unresolved/);
 }
});
test('round7: retention citations contain current handle and Node authorization semantics',()=>{
 const doc=read('docs/Sprint_10_Production_Trust_Recovery.md');
 for(const [file,terms] of [['scripts/production-retention.mjs',['fstatSync','closeSync(descriptors[name])','await invokeRetentionHelper','lstatSync(join(destination,name))']],['scripts/windows-retire-quartet.ps1',['CreateFileW(Path.Combine','info.Links==1','sha.ComputeHash(stream)','SetFileInformationByHandle(handle,4']]]){
  const source=read(file).split('\n');const ranges=[...doc.matchAll(/`([^`\s]+):(\d+)-(\d+)`/g)].filter(m=>m[1]===file).map(m=>source.slice(Number(m[2])-1,Number(m[3])).join('\n'));
  assert.ok(ranges.some(s=>terms.every(t=>s.includes(t))),file);
 }
});
