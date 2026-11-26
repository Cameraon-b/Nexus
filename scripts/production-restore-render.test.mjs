import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {auditRestoreCompose} from './production-restore.mjs';
import {composeEnvironment} from './production-environment.mjs';
import {metadata,project} from './fixtures/restore-runner.mjs';
test('offline actual Compose renderer satisfies closed restore audit for both loopback families',()=>{
 const dir=mkdtempSync(join(tmpdir(),'nexus_restore_render_'));
 try{for(const bindIp of ['127.0.0.1','::1']){
  const config={host:'localhost',bindIp,port:49991,backendSubnet:'10.251.10.0/24',backendDynamicRange:'10.251.10.128/25',frontendIp:'10.251.10.2',edgeSubnet:'10.251.11.0/24',edgeDynamicRange:'10.251.11.128/25',edgeProxy:'10.251.11.2'};
  const secret=join(dir,'fake-password'),env=join(dir,'restore.env');writeFileSync(secret,'synthetic-not-real');
  const values={NEXUS_COMMIT:metadata.commit,NEXUS_HOST:config.host,NEXUS_BIND_IP:bindIp,NEXUS_PORT:config.port,NEXUS_SUBNET:config.backendSubnet,NEXUS_DYNAMIC_RANGE:config.backendDynamicRange,NEXUS_FRONTEND_IP:config.frontendIp,NEXUS_EDGE_SUBNET:config.edgeSubnet,NEXUS_EDGE_DYNAMIC_RANGE:config.edgeDynamicRange,NEXUS_EDGE_PROXY:config.edgeProxy,NEXUS_SECRET_FILE:secret.replaceAll('\\','/')};
  writeFileSync(env,Object.entries(values).map(([k,v])=>`${k}='${v}'`).join('\n')+'\n');
  const pinned=join(dir,'restore-images.json');writeFileSync(pinned,JSON.stringify({services:Object.fromEntries(['api','migrate','frontend','postgres'].map(s=>[s,{image:metadata.imageIds[s==='migrate'?'api':s]}]))}));
  // config is offline: no daemon/resource creation, no production configuration.
  const r=spawnSync('docker',['compose','--project-name',project,'--env-file',env,'-f','deployment/compose.production.yaml','-f',pinned,'config','--format','json'],{encoding:'utf8',shell:false,stdio:'pipe',env:composeEnvironment()});
  assert.equal(r.status,0,'offline Compose render failed');
  const rendered=JSON.parse(r.stdout);for(const [s,v] of Object.entries(rendered.services))assert.equal(v.image,metadata.imageIds[s==='migrate'?'api':s]);
  auditRestoreCompose(rendered,{project,config,metadata,secret,root:process.cwd()});
 }}finally{rmSync(dir,{recursive:true,force:true});}
});
