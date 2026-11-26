import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const doc=read('docs/Sprint_10_Production_Trust_Recovery.md');
function ranges(text,file){return [...text.matchAll(/`([^`\s]+):(\d+)-(\d+)`/g)].filter(m=>m[1]===file);}
function citationValid(source,start,end){return start>=1&&end>=start&&end<=source.replace(/\r?\n$/,'').split('\n').length;}
test('round6: citation validator rejects beyond EOF',()=>{assert.equal(citationValid('a\nb',1,3),false);assert.equal(citationValid('a\nb\n',1,3),false);assert.equal(citationValid('a\nb',1,2),true);});
test('round6: every ranged citation ends within source EOF',()=>{
 for(const m of doc.matchAll(/`([^`\s]+):(\d+)-(\d+)`/g))assert.ok(citationValid(read(m[1]),Number(m[2]),Number(m[3])),m[0]);
});
const anchors=(text,file,terms)=>{const source=read(file).split('\n');assert.ok(ranges(text,file).some(m=>terms.every(t=>source.slice(Number(m[2])-1,Number(m[3])).join('\n').includes(t))),terms.join(', '));};
test('round6: bounded-listing paragraph cites implementation and use sites',()=>{
 const paragraph=doc.split('\n').find(p=>p.includes('Listing now uses'));
 anchors(paragraph,'scripts/pull-production-backup.mjs',['export async function listBounded','listingByteCap-bytes','setTimeout(refuse,deadlineMs)']);
 anchors(paragraph,'scripts/pull-production-backup.mjs',['const bytes=await guarded(()=>list(','new TextDecoder','listing.length>10000']);
});
test('round6: reading-map retention citation includes actual freshness gate',()=>{
 const paragraph=doc.split('\n').find(p=>p.includes('**Operate off-host retention:**'));
 anchors(paragraph,'scripts/pull-production-backup.mjs',['age>maxVerifiedAgeMs','age < -futureSkewMs']);
});
test('round6: directory-lock citation covers pre-mkdir entropy and retry protocol',()=>{
 anchors(doc,'scripts/production-directory-lock.mjs',['entropy(32)','const json=JSON.stringify(safe)','mkdir(path','for(let attempt','continue;']);
});
