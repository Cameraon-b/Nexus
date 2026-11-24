import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,existsSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {cidrsOverlap,allocateSubnets,cleanupAcceptance,auditRuntime} from './production-acceptance-safety.mjs';
test('CIDR overlap handles containing, contained, exact and adjacent IPv4 and IPv6',()=>{
 for(const [a,b,expected] of [['10.253.100.0/24','10.0.0.0/8',true],['10.253.100.0/24','10.253.100.128/25',true],['10.253.100.0/24','10.253.100.0/24',true],['10.253.100.0/24','10.253.101.0/24',false],['fd00::/64','fd00::8000/65',true],['fd00::/64','fd00:0:0:1::/64',false],['fd00::/8','10.0.0.0/8',false]])assert.equal(cidrsOverlap(a,b),expected);
 assert.equal(allocateSubnets(['10.253.100.0/23']),102);
 assert.throws(()=>allocateSubnets(['10.0.0.0/8']));
});
for(const failure of ['stopped','docker',null])test(`cleanup ${failure??'success'}: verifies all containers and retains recovery material on failure`,()=>{
 const dir=mkdtempSync(join(tmpdir(),'nexus-cleanup-test-'));writeFileSync(join(dir,'secret'),'never-print');const calls=[];const messages=[];
 try{
  const success=cleanupAcceptance({dir,project:'nexus_s8_cleanup',destroy:()=>{if(failure==='docker')throw Error('sensitive-error');},query:(kind,args)=>{calls.push([kind,...args]);return kind==='container'&&failure==='stopped'&&args.includes('--all')?'exited-container':'';},log:m=>messages.push(m)});
  assert.equal(success,!failure);assert.equal(existsSync(dir),!!failure);
  if(failure!=='docker')assert.ok(calls[0].includes('--all'));
  assert.ok(!messages.join('').includes('never-print')&&!messages.join('').includes('sensitive-error'));
  if(failure)assert.ok(messages.join('').includes(dir));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
const auditOptions={project:'nexus_s8_fixture',secretFile:'/private/secret',frontendPort:49991};
const container=(service)=>({Config:{User:service==='postgres'?'':['api','migrate'].includes(service)?'app':'101',Labels:{'com.docker.compose.service':service}},State:service==='migrate'?{Status:'exited',ExitCode:0}:{Status:'running',Health:{Status:'healthy'}},Mounts:service==='frontend'?[]:[{Type:'bind',Source:'/private/secret',Destination:'/run/secrets/database_password',RW:false},...(['api','postgres'].includes(service)?[{Type:'volume',Name:`nexus_s8_fixture_${service==='api'?'keys':'database'}`,Source:`/var/lib/docker/volumes/nexus_s8_fixture_${service==='api'?'keys':'database'}/_data`,Destination:service==='api'?'/keys':'/var/lib/postgresql',RW:true}]:[])],HostConfig:{Tmpfs:service==='postgres'?{}:{'/tmp':''},Privileged:false,NetworkMode:'bridge',ReadonlyRootfs:service!=='postgres',SecurityOpt:['no-new-privileges:true'],PortBindings:service==='frontend'?{'8080/tcp':[{HostIp:'127.0.0.1',HostPort:'49991'}]}:{}}});
test('runtime audit accepts private services, loopback-only frontend and read-only secrets',()=>auditRuntime(['frontend','api','postgres','migrate'].map(container),'127.0.0.1',auditOptions));
for(const service of ['api','postgres','migrate'])test(`runtime audit refuses published ${service} ports`,()=>{const all=['frontend','api','postgres','migrate'].map(container),c=all.find(c=>c.Config.Labels['com.docker.compose.service']===service);c.HostConfig.PortBindings={'8080/tcp':[{HostIp:'127.0.0.1'}]};assert.throws(()=>auditRuntime(all,'127.0.0.1',auditOptions));});
for(const ip of ['0.0.0.0','::',''])test(`runtime audit refuses frontend bind ${ip||'unspecified'}`,()=>{const all=['frontend','api','postgres','migrate'].map(container);all[0].HostConfig.PortBindings['8080/tcp'][0].HostIp=ip;assert.throws(()=>auditRuntime(all,'127.0.0.1',auditOptions));});
test('runtime audit refuses writable secret mounts',()=>{const all=['frontend','api','postgres','migrate'].map(container);all[1].Mounts[0].RW=true;assert.throws(()=>auditRuntime(all,'127.0.0.1',auditOptions));});
