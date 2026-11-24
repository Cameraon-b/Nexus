import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditRuntime} from './production-acceptance-safety.mjs';
const services=['postgres','migrate','api','frontend'];
const options={project:'nexus_s8_fixture',secretFile:'C:/private/database-password',frontendPort:49991,tlsPort:49992,tlsDirectory:'C:/private/tls'};
const baseOptions={project:options.project,secretFile:options.secretFile,frontendPort:options.frontendPort};
function fixture(tls=false){return [...services,...(tls?['tls']:[])].map(service=>({Config:{User:service==='postgres'?'':['api','migrate'].includes(service)?'app':'101',Labels:{'com.docker.compose.service':service}},State:service==='migrate'?{Status:'exited',ExitCode:0}:{Status:'running',Health:{Status:'healthy'}},Mounts:service==='tls'?[{Type:'bind',Source:'C:/private/tls',Destination:'/accept',RW:false}]:service==='frontend'?[]:[{Type:'bind',Source:'C:/private/database-password',Destination:'/run/secrets/database_password',RW:false},...(['api','postgres'].includes(service)?[{Type:'volume',Name:`${options.project}_${service==='api'?'keys':'database'}`,Source:`/var/lib/docker/volumes/${options.project}_${service==='api'?'keys':'database'}/_data`,Destination:service==='api'?'/keys':'/var/lib/postgresql',RW:true}]:[])],HostConfig:{Privileged:false,Devices:[],NetworkMode:'bridge',ReadonlyRootfs:service!=='postgres',SecurityOpt:['no-new-privileges:true'],Tmpfs:service==='postgres'?{}:{'/tmp':''},PortBindings:service==='frontend'?{'8080/tcp':[{HostIp:'127.0.0.1',HostPort:'49991'}]}:service==='tls'?{'8443/tcp':[{HostIp:'127.0.0.1',HostPort:'49992'}]}:{}}}));}
const audit=(all,tls=false)=>auditRuntime(all,'127.0.0.1',tls?options:baseOptions);
test('runtime audit accepts exact base and attached TLS phases',()=>{audit(fixture());audit(fixture(true),true);});
for(const service of [...services,'tls'])for(const defect of ['user','rootfs','missing-nnp','extra-seccomp','duplicate-nnp','unexpected-security','device-requests','privileged','host-network'])test(`exact ${service} rejects ${defect}`,()=>{
 const all=fixture(true),c=all.find(c=>c.Config.Labels['com.docker.compose.service']===service);
 if(defect==='user')c.Config.User=service==='postgres'?'app':service==='tls'?'102':'root';
 if(defect==='rootfs')c.HostConfig.ReadonlyRootfs=service==='postgres';
 if(defect==='missing-nnp')c.HostConfig.SecurityOpt=[];
 if(defect==='extra-seccomp')c.HostConfig.SecurityOpt.push('seccomp=unconfined');
 if(defect==='duplicate-nnp')c.HostConfig.SecurityOpt.push('no-new-privileges:true');
 if(defect==='unexpected-security')c.HostConfig.SecurityOpt.push('apparmor=unexpected');
 if(defect==='device-requests')c.HostConfig.DeviceRequests=[{Count:-1,Capabilities:[['gpu']]}];
 if(defect==='privileged')c.HostConfig.Privileged=true;
 if(defect==='host-network')c.HostConfig.NetworkMode='host';
 assert.throws(()=>audit(all,true));
});
for(const service of ['frontend','tls'])for(const defect of ['wrong-port','duplicate','empty','wrong-ip','extra-key','null','object','null-binding','extra-field'])test(`exact ${service} publication rejects ${defect}`,()=>{
 const all=fixture(true),c=all.find(c=>c.Config.Labels['com.docker.compose.service']===service),key=service==='frontend'?'8080/tcp':'8443/tcp',bindings=c.HostConfig.PortBindings[key];
 if(defect==='wrong-port')bindings[0].HostPort='49999';
 if(defect==='duplicate')bindings.push({...bindings[0]});
 if(defect==='empty')bindings.length=0;
 if(defect==='wrong-ip')bindings[0].HostIp='0.0.0.0';
 if(defect==='extra-key')c.HostConfig.PortBindings['80/tcp']=[];
 if(defect==='null')c.HostConfig.PortBindings[key]=null;
 if(defect==='object')c.HostConfig.PortBindings[key]={0:bindings[0],length:1};
 if(defect==='null-binding')bindings[0]=null;
 if(defect==='extra-field')bindings[0].Unexpected=true;
 assert.throws(()=>audit(all,true));
});
test('frontendPort must be explicit',()=>{const {frontendPort,...missing}=baseOptions;assert.throws(()=>auditRuntime(fixture(),'127.0.0.1',missing));});
for(const service of ['api','postgres'])for(const source of ['/srv/docker-data/volumes/exact/_data','/home/rootless/.local/share/docker/volumes/exact/_data','/home/nexus/.local/share/docker/volumes/exact/_data'])test(`${service} portable named volume ${source}`,()=>{
 const all=fixture(),m=all.find(c=>c.Config.Labels['com.docker.compose.service']===service).Mounts[1];
 m.Source=source; audit(all);
 m.Type='bind'; assert.throws(()=>audit(all));
});
for(const service of ['api','tls'])test(`${service} private source mismatch diagnostics disclose neither path`,()=>{
 const all=fixture(true),m=all.find(c=>c.Config.Labels['com.docker.compose.service']===service).Mounts[0];
 const actual='/private/ephemeral-actual-sensitive',expected='/private/ephemeral-expected-sensitive';
 if(service==='api')for(const c of all)for(const mount of c.Mounts)if(mount.Destination==='/run/secrets/database_password')mount.Source=expected;
 m.Source=actual;
 assert.throws(()=>auditRuntime(all,'127.0.0.1',{...options,[service==='tls'?'tlsDirectory':'secretFile']:expected}),error=>{
  const diagnostic=String(error);
  assert.ok(!diagnostic.includes(actual)&&!diagnostic.includes(expected),'private paths must not appear in diagnostics');
  assert.ok(diagnostic.includes(service)&&diagnostic.includes(m.Destination),'diagnostic identifies service and destination');
  return true;
 });
});
for(const service of services)for(const defect of ['extra-bind','extra-volume','anonymous','duplicate','device','extra-tmpfs',...(service==='postgres'?[]:['missing-tmpfs','wrong-tmpfs'])])test(`base ${service} rejects ${defect}`,()=>{
 const all=fixture(),c=all.find(c=>c.Config.Labels['com.docker.compose.service']===service);
 if(defect==='extra-bind')c.Mounts.push({Type:'bind',Source:'C:/',Destination:'/host-root',RW:false});
 if(defect==='extra-volume'||defect==='anonymous')c.Mounts.push({Type:'volume',Name:defect==='anonymous'?'random-id':'unexpected',Source:'/volume',Destination:'/extra',RW:true});
 if(defect==='duplicate')c.Mounts.push(c.Mounts[0]??{Type:'bind',Source:'/extra',Destination:'/tmp',RW:false});
 if(defect==='device')c.HostConfig.Devices=[{PathOnHost:'/dev/sda',PathInContainer:'/dev/sda',CgroupPermissions:'rwm'}];
 if(defect==='extra-tmpfs')c.HostConfig.Tmpfs['/extra']='';
 if(defect==='missing-tmpfs')c.HostConfig.Tmpfs={};
 if(defect==='wrong-tmpfs')c.HostConfig.Tmpfs={'/tmp':'ro'};
 assert.throws(()=>audit(all));
});
for(const service of ['api','migrate','postgres'])for(const defect of ['missing-secret','writable-secret','wrong-source','wrong-destination','wrong-type'])test(`${service} rejects ${defect}`,()=>{
 const all=fixture(),c=all.find(c=>c.Config.Labels['com.docker.compose.service']===service),m=c.Mounts[0];
 if(defect==='missing-secret')c.Mounts.shift();
 if(defect==='writable-secret')m.RW=true;
 if(defect==='wrong-source')m.Source='C:/other/database-password';
 if(defect==='wrong-destination')m.Destination='/run/secrets/other';
 if(defect==='wrong-type')m.Type='volume';
 assert.throws(()=>audit(all));
});
for(const service of ['api','postgres'])for(const defect of ['missing','name','empty-source','non-string-source','destination','mode','type'])test(`${service} rejects ${defect} persistent volume`,()=>{
 const all=fixture(),c=all.find(c=>c.Config.Labels['com.docker.compose.service']===service),m=c.Mounts[1];
 if(defect==='missing')c.Mounts.pop();
 if(defect==='name')m.Name='unexpected';
 if(defect==='empty-source')m.Source='';
 if(defect==='non-string-source')m.Source=null;
 if(defect==='destination')m.Destination+='/data';
 if(defect==='mode')m.RW=false;
 if(defect==='type')m.Type='bind';
 assert.throws(()=>audit(all));
});
test('Docker Desktop Windows bind representations normalize without folding Linux paths',()=>{
 for(const source of ['c:\\private\\database-password','/run/desktop/mnt/host/c/private/database-password','/host_mnt/c/private/database-password']){
  const all=fixture();for(const c of all)if(c.Mounts[0])c.Mounts[0].Source=source;audit(all);
 }
 const all=fixture();all[2].Mounts[0].Source='/PRIVATE/database-password';
 assert.throws(()=>auditRuntime(all,'127.0.0.1',{...baseOptions,secretFile:'/private/database-password'}));
});
test('Linux bind backslashes are literal, not Windows path separators',()=>{
 const all=fixture();for(const c of all)if(c.Mounts[0])c.Mounts[0].Source='/private/secret';
 all[2].Mounts[0].Source='/private\\secret';
 assert.throws(()=>auditRuntime(all,'127.0.0.1',{...baseOptions,secretFile:'/private/secret'}));
});
for(const defect of ['root','writable','unhealthy','tmpfs','mount','publication','extra-port','privileges'])test(`runtime audit rejects TLS ${defect}`,()=>{
 const all=fixture(true),tls=all.at(-1);
 if(defect==='root')tls.Config.User='0:0';
 if(defect==='writable')tls.HostConfig.ReadonlyRootfs=false;
 if(defect==='unhealthy')tls.State.Health.Status='unhealthy';
 if(defect==='tmpfs')tls.HostConfig.Tmpfs={};
 if(defect==='mount')tls.Mounts[0].RW=true;
 if(defect==='publication')tls.HostConfig.PortBindings['8443/tcp'][0].HostPort='49993';
 if(defect==='extra-port')tls.HostConfig.PortBindings['80/tcp']=[];
 if(defect==='privileges')tls.HostConfig.SecurityOpt=[];
 assert.throws(()=>audit(all,true));
});
for(const defect of ['missing','extra','duplicate','migration','database'])test(`runtime audit rejects service set/state ${defect}`,()=>{
 const all=fixture();
 if(defect==='missing')all.shift();
 if(defect==='extra')all.push({...all[0],Config:{...all[0].Config,Labels:{'com.docker.compose.service':'unexpected'}}});
 if(defect==='duplicate')all.push(all[0]);
 if(defect==='migration')all[1].State.ExitCode=1;
 if(defect==='database')all[0].State.Health.Status='unhealthy';
 assert.throws(()=>audit(all));
});
