import assert from 'node:assert/strict';
import {isIP} from 'node:net';
import {auditRuntime} from './production-acceptance-safety.mjs';
import {auditRestoreCompose} from './production-restore.mjs';
import {fail} from './production-recovery.mjs';
export function auditBackupCompose(c,{project,secret,root}){
 const port=c.services.frontend.ports;if(!Array.isArray(port)||port.length!==1)fail();
 const bind=port[0].host_ip;if(!isIP(bind)||['0.0.0.0','::'].includes(bind))fail();
 const b=c.networks.backend.ipam.config[0],e=c.networks.edge.ipam.config[0];
 const r={host:c.services.frontend.environment.NEXUS_HOST,edgeProxy:c.services.frontend.environment.NEXUS_EDGE_PROXY,frontendIp:c.services.frontend.networks.backend.ipv4_address,bindIp:bind,port:Number(port[0].published),backendSubnet:b.subnet,backendDynamicRange:b.ip_range,edgeSubnet:e.subnet,edgeDynamicRange:e.ip_range};
 const commit=c.services.api.image.replace(/^nexus-api:/,'');if(!/^[a-f0-9]{40}$/.test(commit))fail();
 auditRestoreCompose(c,{project,config:r,metadata:{commit,images:{api:c.services.api.image,frontend:c.services.frontend.image,postgres:c.services.postgres.image}},secret,root,imageReferences:{api:c.services.api.image,frontend:c.services.frontend.image,postgres:c.services.postgres.image}});
 return r;
}
export function auditBackupRuntime(containers,c,{project,secret,settings}){
 auditRuntime(containers,settings.bindIp,{frontendPort:settings.port,project,secretFile:secret,approvedProductionBinding:true});
 for(const container of containers){
  const s=container.Config.Labels['com.docker.compose.service'],h=container.HostConfig;
  const networks=s==='frontend'?[project+'_backend',project+'_edge']:[project+'_backend'];assert.deepEqual(Object.keys(container.NetworkSettings.Networks).sort(),networks.sort());
  if(s==='frontend')assert.equal(container.NetworkSettings.Networks[project+'_backend'].IPAddress,settings.frontendIp);
  for(const k of ['CapAdd','CapDrop','Devices','DeviceRequests','VolumesFrom','Links','ExtraHosts','Dns','DnsSearch','DnsOptions'])assert.deepEqual(h[k]??[],[]);
  for(const k of ['PidMode','UTSMode','UsernsMode','CgroupParent'])assert.equal(h[k]??'','');assert.ok([undefined,'private'].includes(h.IpcMode));
  assert.equal(h.NetworkMode,project+'_backend');
  const entrypoint=s==='frontend'?['/bin/sh','-ec']:s==='postgres'?['docker-entrypoint.sh']:['dotnet','Nexus.Api.dll'];
  assert.deepEqual(container.Config.Entrypoint,entrypoint);
  assert.deepEqual(container.Config.Cmd,s==='frontend'?c.services.frontend.command.map(v=>v.replaceAll('$$','$')):s==='postgres'?['postgres']:s==='migrate'?['--migrate-only']:null);
 }
}
