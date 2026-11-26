import {isIP} from 'node:net';
import {rmSync} from 'node:fs';
import assert from 'node:assert/strict';
function cidr(value){
 const [ip,prefixText,...extra]=value.split('/'),version=isIP(ip);
 if(!version||extra.length)throw Error('Invalid Docker CIDR');
 const bits=version===4?32:128,prefix=prefixText===undefined?bits:Number(prefixText);
 if(!Number.isInteger(prefix)||prefix<0||prefix>bits)throw Error('Invalid Docker CIDR');
 let number;
 if(version===4)number=ip.split('.').reduce((n,b)=>(n<<8n)+BigInt(b),0n);
 else{
  let text=ip;
  if(text.includes('.')){const cut=text.lastIndexOf(':');const bytes=text.slice(cut+1).split('.').map(Number);text=text.slice(0,cut+1)+((bytes[0]<<8)+bytes[1]).toString(16)+':'+((bytes[2]<<8)+bytes[3]).toString(16);}
  const [left,right]=text.split('::'),a=left?left.split(':'):[],b=right?right.split(':'):[];
  const groups=text.includes('::')?[...a,...Array(8-a.length-b.length).fill('0'),...b]:a;
  number=groups.reduce((n,g)=>(n<<16n)+BigInt('0x'+g),0n);
 }
 const shift=BigInt(bits-prefix),start=(number>>shift)<<shift;
 return {version,start,end:start+(1n<<shift)-1n};
}
export function cidrsOverlap(a,b){const x=cidr(a),y=cidr(b);return x.version===y.version&&x.start<=y.end&&y.start<=x.end;}
export function allocateSubnets(existing){
 // Parse all inputs even when they cannot overlap the first candidate. Invalid IPAM fails closed.
 existing.forEach(cidr);
 for(let octet=100;octet<=220;octet+=2){
  const backend=`10.253.${octet}.0/24`,edge=`10.253.${octet+1}.0/24`;
  if(!cidrsOverlap(backend,edge)&&!existing.some(n=>cidrsOverlap(n,backend)||cidrsOverlap(n,edge)))return octet;
 }
 throw Error('No isolated subnet available');
}
export function cleanupAcceptance({dir,project,destroy,query,log=console.log}){
 try{
  destroy();
  for(const kind of ['container','network','volume']){
   const args=[...(kind==='container'?['--all']:[]),'--filter',`label=com.docker.compose.project=${project}`,'-q'];
   assert.equal(query(kind,args).trim(),'');
  }
 }catch{
  log(`Recovery material retained: ${dir}`);
  log(`Inspect only project ${project}; retry production.mjs destroy with this directory's production.env and --confirm-destroy ${project}. Verify all labeled containers (including stopped), networks and volumes are absent before deleting this directory. Do not print its contents.`);
  return false;
 }
 rmSync(dir,{recursive:true,force:true});
 log('Exact Docker cleanup verified; temporary recovery material removed.');return true;
}
// Only Windows host paths are case-insensitive. Linux container destinations stay exact.
function hostPath(value){
 assert.equal(typeof value,'string');
 if(/^[a-z]:[\\/]/i.test(value))return value.replaceAll('\\','/').toLowerCase();
 const desktop=value.match(/^\/(?:run\/desktop\/mnt\/host|host_mnt)\/([a-z])\/(.*)$/i);
 return desktop?`${desktop[1]}:/${desktop[2]}`.toLowerCase():value;
}
export function auditRuntime(containers,loopback,{frontendPort,tlsPort,tlsDirectory,project,secretFile,approvedProductionBinding=false}={}){
 assert.ok(Number.isInteger(frontendPort)&&frontendPort>0&&frontendPort<=65535,'explicit expected frontend port');
 assert.match(project??'',/^[a-z0-9][a-z0-9_-]*$/);
 assert.ok(secretFile);
 assert.ok(['127.0.0.1','::1'].includes(loopback)||approvedProductionBinding&&isIP(loopback)&&!['0.0.0.0','::'].includes(loopback));
 const expected=['postgres','migrate','api','frontend',...(tlsPort===undefined?[]:['tls'])];
 assert.deepEqual(containers.map(c=>c.Config.Labels['com.docker.compose.service']).sort(),expected.sort(),'exact audited service set');
 for(const c of containers){
  const service=c.Config.Labels['com.docker.compose.service'];
  if(service==='migrate'){assert.equal(c.State.Status,'exited');assert.equal(c.State.ExitCode,0);}
  else {assert.equal(c.State.Status,'running');assert.equal(c.State.Health?.Status,'healthy');}
  assert.equal(c.Config.User,service==='postgres'?'':['api','migrate'].includes(service)?'app':'101',`${service} exact configured user`);
  assert.equal(c.HostConfig.ReadonlyRootfs,service!=='postgres',`${service} exact root filesystem mode`);
  assert.deepEqual(c.HostConfig.Devices??[],[],'no device mappings');
  assert.deepEqual(c.HostConfig.DeviceRequests??[],[],'no device requests');
  assert.deepEqual(c.HostConfig.Tmpfs??{},service==='postgres'?{}:{'/tmp':''},`${service} exact tmpfs`);
  const mounts=service==='tls'?[{Type:'bind',Source:tlsDirectory,Destination:'/accept',RW:false}]:service==='frontend'?[]:[
   {Type:'bind',Source:secretFile,Destination:'/run/secrets/database_password',RW:false},
   ...(['api','postgres'].includes(service)?[{Type:'volume',Name:`${project}_${service==='api'?'keys':'database'}`,Destination:service==='api'?'/keys':'/var/lib/postgresql',RW:true}]:[])
  ];
  assert.equal(c.Mounts.length,mounts.length,`${service} exact mount count`);
  assert.equal(new Set(c.Mounts.map(m=>m.Destination)).size,c.Mounts.length,'no duplicate destinations');
  for(const expected of mounts){
   const mount=c.Mounts.find(m=>m.Destination===expected.Destination);
   assert.ok(mount,`${service} missing ${expected.Destination}`);
   assert.equal(mount.Type,expected.Type);assert.equal(mount.RW,expected.RW);
   if(expected.Type==='bind'){
    // Boolean assertions avoid assertion actual/expected values exposing private host paths.
    assert.ok(typeof mount.Source==='string'&&typeof expected.Source==='string'&&hostPath(mount.Source)===hostPath(expected.Source),`${service} ${expected.Destination} source mismatch`);
   }else {
    assert.equal(mount.Name,expected.Name);
    assert.ok(typeof mount.Source==='string'&&mount.Source.length>0,`${service} ${expected.Destination} volume source required`);
   }
  }
  if(service==='tls')assert.deepEqual(c.HostConfig.PortBindings,{'8443/tcp':[{HostIp:loopback,HostPort:String(tlsPort)}]});
  const ports=c.HostConfig.PortBindings??{};
  if(['api','postgres','migrate'].includes(service))assert.equal(Object.keys(ports).length,0);
  if(service==='frontend')assert.deepEqual(ports,{'8080/tcp':[{HostIp:loopback,HostPort:String(frontendPort)}]});
  assert.equal(c.HostConfig.Privileged,false);assert.notEqual(c.HostConfig.NetworkMode,'host');
  assert.deepEqual(c.HostConfig.SecurityOpt,['no-new-privileges:true'],`${service} exact security options`);
  for(const m of c.Mounts){
   assert.ok(!m.Destination.includes('docker.sock'));
   if(m.Type==='bind')assert.ok(!m.Source.replaceAll('\\','/').toLowerCase().includes('/nexus/.local'));
   if(m.Destination.startsWith('/run/secrets/'))assert.equal(m.RW,false);
  }
 }
}
