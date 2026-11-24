import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {composeEnvironment} from './production-environment.mjs';

test('actual acceptance environment and TLS overlay preserve base network IPAM exactly',async()=>{
 const {acceptanceEnvironment,tlsOverlay}=await import('./production-acceptance-config.mjs');
 const dir=mkdtempSync(join(tmpdir(),'nexus-network-contract-'));
 try{
  const env=join(dir,'production.env'),overlay=join(dir,'tls.json');
  writeFileSync(env,acceptanceEnvironment({commit:'bd054b4a63d453488b7207651fdaad0df4e9df0b',dir,octet:100,frontendPort:49991}));
  writeFileSync(overlay,JSON.stringify(tlsOverlay({tlsDir:dir,tlsPort:49992,octet:100})));
  const render=(extra=[])=>{
   const r=spawnSync('docker',['compose','-p','nexus_s8_network_contract','--env-file',env,'-f','deployment/compose.production.yaml',...extra,'config','--format','json'],{encoding:'utf8',env:composeEnvironment()});
   assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);
  };
  const base=render(),tls=render(['-f',overlay]);
  assert.deepEqual(tls.networks,base.networks,'adding TLS must never recreate a network used by frontend');
  assert.deepEqual(base.networks.edge.ipam.config,[{subnet:'10.253.101.0/24',ip_range:'10.253.101.128/25'}]);
  assert.equal(tls.services.tls.networks.edge.ipv4_address,'10.253.101.2');
  assert.ok(tls.services.tls.healthcheck?.test,'HTTPS startup must wait for TLS readiness');
  assert.equal(base.services.frontend.environment.NEXUS_EDGE_PROXY,'10.253.101.2');
  assert.deepEqual(Object.keys(tls.services.frontend.networks).sort(),['backend','edge']);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
