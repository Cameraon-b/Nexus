import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {operationCandidate,removeFixture as rmSync} from './fixtures/operation-candidate.mjs';
import {bindCandidate} from './production-candidate-binding.mjs';
test('separate host Docker read-only cached Linux byte consumption and host Compose config (not Linux proc-fd proof)',{skip:process.platform!=='win32'},()=>{
 const base=mkdtempSync(join(tmpdir(),'nexus-r13-docker-')),name='nexus-s8-r13-readonly-'+randomBytes(12).toString('hex');
 const run=args=>{const r=spawnSync('docker',args,{encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr);return r.stdout;};
 try{
  const {root}=operationCandidate(base),before=bindCandidate(root),config=join(base,'config/production.env'),compose=join(base,'config/compose.yaml');mkdirSync(join(base,'config'));
  writeFileSync(config,'NEXUS_PROOF=original\n');writeFileSync(compose,'services:\n  proof:\n    image: node:24-alpine\n    labels:\n      nexus.disposable.proof: ${NEXUS_PROOF}\n');
  const rendered=JSON.parse(run(['compose','--project-name',name.replaceAll('-','_'),'--env-file',config,'-f',compose,'config','--format','json']));
  assert.equal(rendered.services.proof.labels['nexus.disposable.proof'],'original');
  const manifest=relative(base,join(root,'MANIFEST.sha256')).replaceAll('\\','/');
  const script=`const fs=require('fs'),c=require('crypto');const b=fs.readFileSync('/proof/'+process.argv[1]);console.log(JSON.stringify({manifest:c.createHash('sha256').update(b).digest('hex'),env:fs.readFileSync('/proof/config/production.env','utf8'),compose:fs.readFileSync('/proof/config/compose.yaml','utf8')}));`;
  const consumed=JSON.parse(run(['run','--rm','--name',name,'--pull=never','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--mount',`type=bind,source=${base},target=/proof,readonly`,'--entrypoint','node','node:24-alpine','-e',script,manifest]));
  assert.equal(consumed.manifest,root.split(/[\\/]/).at(-1));assert.equal(consumed.env,'NEXUS_PROOF=original\n');assert.match(consumed.compose,/nexus.disposable.proof/);assert.deepEqual(bindCandidate(root),before);
 }finally{rmSync(base,{recursive:true,force:true,maxRetries:20,retryDelay:50});}
});
