import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {bindCandidate} from './production-candidate-binding.mjs';
import {candidateCustody} from './production-candidate-custody.mjs';
import {privateCustody,removeFixture} from './fixtures/operation-candidate.mjs';
test('round14 authenticated manifest must use canonical ordinal path order',()=>{
 const d=mkdtempSync(join(resolve('artifacts'),'nexus-r14-custody-'));privateCustody(d);
 try{
  const sha=b=>createHash('sha256').update(b).digest('hex'),data=Buffer.from('reviewed');
  const manifest=sha(data)+' *deployment/b\n'+sha(data)+' *deployment/a\n',id=sha(manifest),root=join(d,id);
  mkdirSync(join(root,'deployment'),{recursive:true});writeFileSync(join(root,'deployment/a'),data);writeFileSync(join(root,'deployment/b'),data);writeFileSync(join(root,'MANIFEST.sha256'),manifest);writeFileSync(join(root,'CANDIDATE_ID'),id+'\n');candidateCustody(root,{install:true});
  assert.throws(()=>bindCandidate(root));
 }finally{removeFixture(d,{recursive:true,force:true});}
});
test('round14 owner-writable authenticated candidate refuses before operational use',()=>{
 const d=mkdtempSync(join(resolve('artifacts'),'nexus-r14-custody-'));privateCustody(d);
 try{
  const data=Buffer.from('reviewed'),sha=b=>createHash('sha256').update(b).digest('hex');
  const manifest=sha(data)+' *deployment/file\n',id=sha(manifest),root=join(d,id);
  mkdirSync(join(root,'deployment'),{recursive:true});writeFileSync(join(root,'deployment/file'),data);
  writeFileSync(join(root,'MANIFEST.sha256'),manifest);writeFileSync(join(root,'CANDIDATE_ID'),id+'\n');
  assert.throws(()=>bindCandidate(root),/Candidate/);
 }finally{rmSync(d,{recursive:true,force:true});}
});
