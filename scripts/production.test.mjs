import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('resolved production topology isolates state, secrets and exposure',()=>{
 const dir=mkdtempSync(join(tmpdir(),'nexus-config-'));
 try {
  const secret=join(dir,'db-password'); writeFileSync(secret,'disposable-value-not-a-default');
  const r=spawnSync('docker',['compose','-p','nexus_s8_config_test','-f','deployment/compose.production.yaml','config','--format','json'],{encoding:'utf8',env:{...process.env,NEXUS_COMMIT:'bd054b4a63d453488b7207651fdaad0df4e9df0b',NEXUS_SECRET_FILE:secret,NEXUS_HOST:'nexus.aether.lab',NEXUS_EDGE_PROXY:'172.30.89.2',NEXUS_FRONTEND_IP:'172.30.88.2',NEXUS_SUBNET:'172.30.88.0/24',NEXUS_DYNAMIC_RANGE:'172.30.88.128/25',NEXUS_EDGE_SUBNET:'172.30.89.0/24',NEXUS_EDGE_DYNAMIC_RANGE:'172.30.89.128/25'}});
  assert.equal(r.status,0,r.stderr);
  const c=JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(c.services).sort(),['api','frontend','migrate','postgres']);
  for(const [name,s] of Object.entries(c.services)){
   assert.equal(s.privileged,undefined);
   assert.notEqual(s.network_mode,'host');
   assert.equal((s.ports??[]).length,name==='frontend'?1:0);
   assert.ok(!(s.volumes??[]).some(v=>v.type==='bind'));
  }
  assert.equal(c.networks.backend.internal,true);
  assert.ok(c.volumes.database);assert.ok(c.volumes.keys);
  assert.equal(c.services.api.depends_on.migrate.condition,'service_completed_successfully');
  assert.ok(c.services.postgres.environment.POSTGRES_PASSWORD_FILE);
  assert.ok(!r.stdout.includes('disposable-value-not-a-default'));
  assert.equal(c.services.api.read_only,true);assert.equal(c.services.frontend.read_only,true);
 } finally {rmSync(dir,{recursive:true,force:true});}
});

test('build context excludes local, private and generated inputs',()=>{
 const ignore=readFileSync('.dockerignore','utf8');
 for(const name of ['.git','.local','.tools','.cache','.browsers','node_modules','artifacts','test-results','**/bin','**/obj','**/.test-keys','tests','.npm-cache','node-compile-cache','**/*.tsbuildinfo']) assert.ok(ignore.split(/\r?\n/).includes(name),name);
 for(const path of ['deployment/api.Dockerfile','deployment/frontend.Dockerfile']) {
  const file=readFileSync(path,'utf8');
  for(const line of file.split('\n').filter(l=>l.startsWith('FROM '))) assert.match(line,/@sha256:[0-9a-f]{64}/);
  assert.match(file,/USER /);
 }
});
