import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {spawnNodeSync} from './fixtures/spawn-node.mjs';
import {mkdtempSync,rmSync,readdirSync,readFileSync,existsSync,writeFileSync,mkdirSync,copyFileSync,unlinkSync,linkSync,symlinkSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {candidateInventory} from './production-candidate-inventory.mjs';
import {removeFixture,relaxFixture} from './fixtures/operation-candidate.mjs';
function command(args){return spawnNodeSync(['scripts/production-candidate.mjs',...args],{encoding:'utf8',timeout:90000});}
test('round14 builder excludes unlisted private/generated files and refuses hardlink/reparse allowed inputs',()=>{
 const d=mkdtempSync(join(resolve('artifacts'),'nexus-r14-source-'));
 try{
  const source=join(d,'source'),custody=join(d,'custody');mkdirSync(source);mkdirSync(custody);
  for(const name of candidateInventory){mkdirSync(dirname(join(source,name)),{recursive:true});copyFileSync(resolve(name),join(source,name));}
  mkdirSync(join(source,'.local'));writeFileSync(join(source,'.local','private.json'),'SYNTHETIC_PRIVATE_EXCLUSION');mkdirSync(join(source,'dist'));writeFileSync(join(source,'dist','generated'),'SYNTHETIC_GENERATED_EXCLUSION');
  const args=['construct','--source',source,'--custody',custody],ok=command(args);assert.equal(ok.status,0,ok.stderr);
  const manifest=readFileSync(join(custody,'tools/candidates',ok.stdout.trim(),'MANIFEST.sha256'),'utf8');assert.ok(!manifest.includes('.local')&&!manifest.includes('dist/'));
  const allowed=join(source,'deployment/compose.production.yaml'),alias=join(source,'hardlink-alias');linkSync(allowed,alias);
  assert.notEqual(command(args).status,0);unlinkSync(alias);
  const replacement=join(source,'replacement');copyFileSync(allowed,replacement);unlinkSync(allowed);symlinkSync(replacement,allowed);
  assert.notEqual(command(args).status,0);
 }finally{removeFixture(d,{recursive:true,force:true});}
});
test('round14 production builder deterministic exact idempotence, closed inventory and verification',()=>{
 const d=mkdtempSync(join(resolve('artifacts'),'nexus-r14-builder-'));
 try{
  const args=['construct','--source',resolve('.'),'--custody',d];
  const first=command(args);assert.equal(first.status,0,first.stderr);assert.match(first.stdout,/^[a-f0-9]{64}\n$/);
  const id=first.stdout.trim(),root=join(d,'tools/candidates',id);
  assert.equal(readFileSync(join(root,'CANDIDATE_ID'),'utf8'),id+'\n');
  assert.equal(command(args).stdout,first.stdout);
  assert.equal(command(['verify','--candidate',root]).status,0);
  const manifest=readFileSync(join(root,'MANIFEST.sha256'),'utf8');
  assert.ok(!/test|fixtures|\.local|private\.json|node_modules|dist\//.test(manifest));
  assert.ok(manifest.includes(' *scripts/production.mjs\n'));
  assert.deepEqual(readdirSync(join(d,'tools/candidates')),[id]);
  assert.notEqual(command([...args,'--extra','x']).status,0);
  assert.ok(!existsSync(join(root,'.local')));
  const packet=join(d,'transfer.json');assert.equal(command(['package','--candidate',root,'--output',packet]).stdout,first.stdout);
  const receiver=join(d,'receiver');mkdirSync(receiver);
  assert.equal(command(['install','--package',packet,'--custody',receiver]).stdout,first.stdout);
  assert.equal(readFileSync(join(receiver,'tools/candidates',id,'MANIFEST.sha256'),'utf8'),manifest);
  if(process.platform==='win32'){
   const native=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File','scripts/verify-production-candidate.ps1','-Candidate',root],{encoding:'utf8'});assert.equal(native.status,0,native.stderr);
  }
  relaxFixture(root);const member=join(root,'deployment/compose.production.yaml');writeFileSync(member,'tampered');
  assert.notEqual(command(args).status,0);assert.equal(readFileSync(member,'utf8'),'tampered');
 }finally{
  if(process.platform==='win32'){
   const user=spawnSync('whoami.exe',[],{encoding:'utf8'}).stdout.trim();spawnSync('icacls.exe',[d,'/grant:r',`${user}:(OI)(CI)F`,'/T','/C'],{encoding:'utf8'});
  }else spawnSync('chmod',['-R','u+rwX',d]);
  removeFixture(d,{recursive:true,force:true});
 }
});
