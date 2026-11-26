import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,renameSync,existsSync,linkSync,symlinkSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {bindCandidate as nativeBindCandidate,checkCandidate,candidateLimits} from './production-candidate-binding.mjs';
import {bindOperationCustody as nativeBindOperationCustody,acquireCustodyLock} from './production-lock-custody.mjs';
import {externalPath} from './production-recovery.mjs';
import {validateRestoreConfig} from './production-restore.mjs';
import {privateCustody,operationCandidate,relaxFixture,removeFixture as rmSync} from './fixtures/operation-candidate.mjs';
import {candidateCustody} from './production-candidate-custody.mjs';
const seal=root=>{try{candidateCustody(root);}catch{candidateCustody(root,{install:true});}};
const bindCandidate=root=>{seal(root);return nativeBindCandidate(root);};
const bindOperationCustody=(config,root)=>{seal(root);return nativeBindOperationCustody(config,root);};
const sha=b=>createHash('sha256').update(b).digest('hex');
async function fixture(fn,manifest){
 const d=mkdtempSync(join(homedir(),'.nexus-candidate-proof-'));privateCustody(d);
 try{
  const text=manifest??sha('original')+' *deployment/compose.yaml\n';
  const root=join(d,'tools/candidates',sha(text));mkdirSync(join(root,'deployment'),{recursive:true,mode:0o700});
  writeFileSync(join(root,'deployment/compose.yaml'),'original',{mode:0o600});
  writeFileSync(join(root,'MANIFEST.sha256'),text,{mode:0o600});writeFileSync(join(root,'CANDIDATE_ID'),sha(text)+'\n',{mode:0o600});
  const config=join(d,'config/restore.json');mkdirSync(join(d,'config'));writeFileSync(config,'{}',{mode:0o600});
  await fn({d,root,config,member:join(root,'deployment/compose.yaml')});
 }finally{rmSync(d,{recursive:true,force:true,maxRetries:20,retryDelay:50});}
}
for(const [name,change] of Object.entries({
 'malformed basename':f=>{renameSync(f.root,f.root+'A');f.root+='A';},
 'ID mismatch':f=>writeFileSync(join(f.root,'CANDIDATE_ID'),'0'.repeat(64)),
 'manifest hash mismatch':f=>writeFileSync(join(f.root,'MANIFEST.sha256'),sha('other')+' *deployment/compose.yaml\n'),
 'missing member':f=>rmSync(f.member),
 'extra member':f=>writeFileSync(join(f.root,'extra'),'extra'),
 'empty extra directory':f=>mkdirSync(join(f.root,'extra')),
 'member hash drift':f=>writeFileSync(f.member,'modified'),
 'member hardlink':f=>linkSync(f.member,join(f.d,'link')),
 'metadata hardlink':f=>linkSync(join(f.root,'CANDIDATE_ID'),join(f.d,'link')),
 'manifest hardlink':f=>linkSync(join(f.root,'MANIFEST.sha256'),join(f.d,'link')),
 'ID extra newline':f=>writeFileSync(join(f.root,'CANDIDATE_ID'),f.root.split(/[\\/]/).at(-1)+'\n\n'),
 'metadata directory':f=>{rmSync(join(f.root,'CANDIDATE_ID'));mkdirSync(join(f.root,'CANDIDATE_ID'));},
 'manifest symlink/reparse':f=>{const path=join(f.root,'MANIFEST.sha256');renameSync(path,join(f.d,'manifest'));symlinkSync(join(f.d,'manifest'),path);},
 'member symlink/reparse':f=>{rmSync(f.member);symlinkSync(join(f.d,'config/restore.json'),f.member);},
 'oversized manifest':f=>writeFileSync(join(f.root,'MANIFEST.sha256'),'x'.repeat(candidateLimits.manifest+1)),
 'oversized member':f=>writeFileSync(f.member,Buffer.alloc(candidateLimits.member+1)),
}))test('candidate refuses before mutation: '+name,()=>fixture(async f=>{
 change(f);assert.throws(()=>bindOperationCustody(f.config,f.root));assert.equal(existsSync(join(f.d,'.nexus-production-locks')),false);
}));
for(const entry of ['deployment/compose.yaml','../escape','a\\b','/absolute','deployment/../escape','a//b','a/./b','CANDIDATE_ID','MANIFEST.sha256','a\0b'])test('candidate rejects closed manifest entry '+JSON.stringify(entry),()=>{
 const text=entry==='deployment/compose.yaml'?(sha('original')+' *'+entry+'\n').repeat(2):sha('original')+' *'+entry+'\n';
 return fixture(f=>{assert.throws(()=>bindCandidate(f.root));assert.equal(existsSync(join(f.d,'.nexus-production-locks')),false);},text);
});
test('candidate permits exactly matching ID without LF',()=>fixture(f=>{writeFileSync(join(f.root,'CANDIDATE_ID'),f.root.split(/[\\/]/).at(-1));assert.ok(bindCandidate(f.root));}));
test('candidate refuses noncanonical unterminated manifest',()=>fixture(f=>assert.throws(()=>bindCandidate(f.root)),sha('original')+' *deployment/compose.yaml'));
test('candidate refuses oversized listed inventory',()=>fixture(f=>assert.throws(()=>bindCandidate(f.root)),Array.from({length:candidateLimits.members+1},(_,i)=>sha('original')+' *file'+i+'\n').join('')));
test('candidate binds identities before dispatch, even when replacement bytes match',()=>fixture(async f=>{
 const binding=bindOperationCustody(f.config,f.root);relaxFixture(f.root);renameSync(f.member,f.member+'-old');writeFileSync(f.member,'original');rmSync(f.member+'-old');
 assert.throws(()=>checkCandidate(binding.candidateBinding));
 await assert.rejects(async()=>acquireCustodyLock('nexus_disposable_candidate_identity',f.config,binding));
 assert.equal(existsSync(join(f.d,'.nexus-production-locks')),false);
}));
for(const shape of ['Reeba','Nora'])test('manifest-bound '+shape+' installed layout accepts generated candidate without byte changes',async()=>{
 // Nora's absolute layout is mapped into a disposable synthetic prefix; never /srv itself.
 const base=mkdtempSync(join(homedir(),'.nexus-layout-'));privateCustody(base);
 const custody=shape==='Nora'?join(base,'srv/nexus/shared'):join(base,'Reeba Backup');mkdirSync(custody,{recursive:true,mode:0o700});
 try{
  const {root}=operationCandidate(custody),config=join(custody,'config/restore.json');mkdirSync(join(custody,'config'));
  const external=join(base,'external');mkdirSync(external);const identity=join(external,'identity'),artifact=join(external,'artifact');writeFileSync(identity,'synthetic');writeFileSync(artifact,'synthetic');
  const restore={...JSON.parse(readFileSync(new URL('../deployment/restore.config.example.json',import.meta.url))),identity,tempRoot:external};
  writeFileSync(config,JSON.stringify(restore),{mode:0o600});
  const before=bindCandidate(root);const binding=bindOperationCustody(config,root);
  assert.equal(binding.config,config);const restored=validateRestoreConfig(JSON.parse(readFileSync(config)));
  assert.equal(externalPath(restored.identity,root),identity);assert.equal(externalPath(restored.tempRoot,root,true),external);assert.equal(externalPath(artifact,root),artifact);
  assert.throws(()=>externalPath(join(root,'CANDIDATE_ID'),root));
  const release=await acquireCustodyLock('nexus_disposable_layout_'+sha(custody),config,binding);await release();
  assert.deepEqual(bindCandidate(root),before);
 }finally{rmSync(base,{recursive:true,force:true,maxRetries:20,retryDelay:50});}
});
test('production argv/env cannot enable synthetic binding seam',()=>{
 const loader=process.platform==='linux'&&process.env.NEXUS_TEST_NODE_LOADER;
 const r=spawnSync(loader||process.execPath,[...(loader?['--library-path',dirname(loader),process.env.NEXUS_TEST_NODE_EXECUTABLE]:[]),'scripts/production.mjs','stop','--project','nexus_disposable_binding','--config-file','missing','--custody-root','.'],{encoding:'utf8',env:{...process.env,NEXUS_TEST_CUSTODY_ROOT:process.cwd()}});
 assert.equal(r.status,1);assert.match(r.stderr,/refused/i);
});
