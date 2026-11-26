import {isIP} from 'node:net';
import {isAbsolute,join,resolve} from 'node:path';
import fs,{writeFileSync,chmodSync} from 'node:fs';
import assert from 'node:assert/strict';
import {fail,exactKeys,keyFingerprint} from './production-recovery.mjs';
import {composeEnvironment} from './production-environment.mjs';
import {cidrsOverlap,auditRuntime} from './production-acceptance-safety.mjs';
import {aggregateSql,parseAggregates,sameAggregates,psqlArgs} from './production-aggregates.mjs';
const configKeys=['identity','tempRoot','sourceProject','host','bindIp','port','backendSubnet','backendDynamicRange','frontendIp','edgeSubnet','edgeDynamicRange','edgeProxy'];
function range(text){
 if(typeof text!=='string'||!/^\d+\.\d+\.\d+\.\d+\/(?:[0-9]|[12][0-9]|3[0-2])$/.test(text))fail();
 const [ip,p]=text.split('/');if(isIP(ip)!==4)fail();
 const n=ip.split('.').reduce((a,b)=>a*256+Number(b),0),size=2**(32-Number(p));
 if(n%size)fail();return {start:n,end:n+size-1};
}
function address(ip){if(isIP(ip)!==4)fail();return range(ip+'/32').start;}
const contains=(a,b)=>a.start<=b.start&&a.end>=b.end;
const privateRanges=['10.0.0.0/8','172.16.0.0/12','192.168.0.0/16'].map(range);
export function validateRestoreConfig(c,existing=[]){
 try{
  exactKeys(c,configKeys);
  for(const k of ['identity','tempRoot'])if(typeof c[k]!=='string'||!isAbsolute(c[k])||/[\r\n\0]/.test(c[k]))fail();
  if(!/^nexus_(prod|s8)_[a-z0-9_]+$/.test(c.sourceProject)||c.host!=='localhost'||!['127.0.0.1','::1'].includes(c.bindIp)||!Number.isInteger(c.port)||c.port<1||c.port>65535)fail();
  const b=range(c.backendSubnet),bd=range(c.backendDynamicRange),e=range(c.edgeSubnet),ed=range(c.edgeDynamicRange);
  for(const r of [b,bd,e,ed])if(!privateRanges.some(p=>contains(p,r)))fail();
  if(!contains(b,bd)||!contains(e,ed)||cidrsOverlap(c.backendSubnet,c.edgeSubnet))fail();
  for(const [ip,sub,dynamic] of [[c.frontendIp,b,bd],[c.edgeProxy,e,ed]]){const n=address(ip);if(n<=sub.start+1||n>=sub.end||n>=dynamic.start&&n<=dynamic.end)fail();}
  for(const n of existing)if(cidrsOverlap(n,c.backendSubnet)||cidrsOverlap(n,c.edgeSubnet))fail();
  return c;
 }catch{fail();}
}
const frontendCommand=`mkdir -p /tmp/conf.d
envsubst '$$NEXUS_HOST $$NEXUS_EDGE_PROXY' < /etc/nginx/templates/default.conf.template > /tmp/conf.d/default.conf
printf 'pid /tmp/nginx.pid; events {} http { include /etc/nginx/mime.types; access_log off; client_body_temp_path /tmp/client_temp; proxy_temp_path /tmp/proxy_temp; fastcgi_temp_path /tmp/fastcgi_temp; uwsgi_temp_path /tmp/uwsgi_temp; scgi_temp_path /tmp/scgi_temp; include /tmp/conf.d/*.conf; }' > /tmp/nginx.conf
exec nginx -c /tmp/nginx.conf -g 'daemon off;'
`;
// A closed allowlist for rendered Compose, not a sanitised second deployment definition.
export function auditRestoreCompose(c,{project,config:r,metadata:m,secret,root,imageReferences=m.imageIds}){
 const eq=assert.deepEqual;
 exactKeys(c,['name','services','networks','volumes','secrets']);assert.equal(c.name,project);
 exactKeys(c.services,['postgres','migrate','api','frontend']);exactKeys(c.networks,['backend','edge']);exactKeys(c.volumes,['database','keys']);exactKeys(c.secrets,['database_password']);
 eq(c.secrets.database_password,{name:project+'_database_password',file:secret.replaceAll('\\','/')});
 for(const name of ['database','keys'])eq(c.volumes[name],{name:project+'_'+name});
 for(const [name,subnet,dynamic] of [['backend',r.backendSubnet,r.backendDynamicRange],['edge',r.edgeSubnet,r.edgeDynamicRange]]){
  const n=c.networks[name];exactKeys(n,['name','ipam',...(name==='backend'?['internal']:[])]);assert.equal(n.name,project+'_'+name);if(name==='backend')assert.equal(n.internal,true);
  eq(n.ipam,{config:[{subnet,ip_range:dynamic}]});
 }
 const apiEnv={ASPNETCORE_ENVIRONMENT:'Production',Nexus__DatabasePasswordFile:'/run/secrets/database_password',Nexus__DatabaseHost:'postgres',Nexus__DataProtectionPath:'/keys',Nexus__AllowPublicRegistration:'false',AllowedHosts:r.host,Nexus__TrustedProxies:r.frontendIp};
 for(const [name,s] of Object.entries(c.services)){
  const allowed=['image','environment','networks','restart','security_opt',...(name==='postgres'?['healthcheck','secrets','volumes']:['read_only','tmpfs','depends_on']),...(['api','migrate'].includes(name)?['secrets']:[]),...(name==='api'?['volumes']:[]),...(name==='migrate'?['build','command','healthcheck']:[]),...(name==='frontend'?['build','entrypoint','command','ports']:[])];
  for(const k of ['command','entrypoint'])if(s[k]===null){allowed.push(k);}
  exactKeys(s,[...new Set(allowed)]);assert.equal(s.image,imageReferences[name==='migrate'?'api':name]);eq(s.security_opt,['no-new-privileges:true']);assert.equal(s.restart,name==='migrate'?'no':'unless-stopped');
  const nets=name==='frontend'?{backend:{ipv4_address:r.frontendIp},edge:{}}:{backend:null};eq(s.networks,nets);
  if(name!=='postgres'){assert.equal(s.read_only,true);eq(s.tmpfs,['/tmp']);}
  if(s.build){exactKeys(s.build,['context','dockerfile','args']);auditBuildContext(s.build.context,root);assert.equal(s.build.dockerfile,'deployment/'+(name==='frontend'?'frontend':'api')+'.Dockerfile');eq(s.build.args,{NEXUS_COMMIT:m.commit});}
  if(name!=='frontend')eq(s.secrets,[{source:'database_password',target:'/run/secrets/database_password'}]);
  if(name==='postgres'){
   eq(s.environment,{POSTGRES_DB:'nexus',POSTGRES_USER:'nexus',POSTGRES_PASSWORD_FILE:'/run/secrets/database_password'});
   eq(s.healthcheck,{test:['CMD-SHELL','pg_isready -U nexus -d nexus'],interval:'5s',timeout:'3s',retries:20});
  }else if(name==='frontend'){
   eq(s.environment,{NEXUS_HOST:r.host,NEXUS_EDGE_PROXY:r.edgeProxy,NGINX_ENVSUBST_OUTPUT_DIR:'/tmp/conf.d'});
   eq(s.entrypoint,['/bin/sh','-ec']);eq(s.command,[frontendCommand]);
   eq(s.ports,[{mode:'ingress',host_ip:r.bindIp,target:8080,published:String(r.port),protocol:'tcp'}]);
  }else eq(s.environment,apiEnv);
  if(name==='migrate'){eq(s.command,['--migrate-only']);eq(s.healthcheck,{disable:true});}
  if(name!=='postgres'){
   const dep=name==='frontend'?'api':name==='api'?'migrate':'postgres';
   eq(s.depends_on,{[dep]:{condition:name==='api'?'service_completed_successfully':'service_healthy',required:true}});
  }
  if(s.volumes){const source=name==='api'?'keys':'database',target=name==='api'?'/keys':'/var/lib/postgresql';eq(s.volumes,[{type:'volume',source,target,volume:{}}]);}
 }
}
// Child processes keep network probes bounded and captured just like Docker; no shell or inherited IO.
const portProbe=`import {createServer} from 'node:net';const s=createServer();s.once('error',()=>process.exit(1));s.listen(Number(process.argv[2]),process.argv[1],()=>s.close());setTimeout(()=>process.exit(1),3000).unref();`;
const frontendProbe=`import {verifyFrontend} from ${JSON.stringify(new URL('./production-frontend.mjs',import.meta.url).href)};await verifyFrontend(process.argv[1],process.argv[2]);process.stdout.write('frontend verified');`;
const statusProbe=`import {readRestoreStatus} from ${JSON.stringify(new URL('./production-http.mjs',import.meta.url).href)};process.stdout.write(await readRestoreStatus(process.argv[1],process.argv[2]));`;
export const emptyDatabaseSql=`SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%') + (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema')) + (SELECT count(*) FROM pg_extension WHERE extname <> 'plpgsql') + (SELECT count(*) FROM pg_namespace WHERE nspname NOT IN ('public','pg_catalog','information_schema','pg_toast') AND nspname NOT LIKE 'pg_temp%' AND nspname NOT LIKE 'pg_toast_temp%') + (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public');`;
export function restoreStack({project,root,stage,config:r,metadata:m,files,run}){
 let begun=false,primary;
 const secret=join(stage,'database-password'),env=join(stage,'production.env');
 const docker=(args,input)=>run('docker',args,{cwd:root,env:composeEnvironment(),...(input?{input}:{})});
 const pinned=join(stage,'restore-images.json');
 const compose=['compose','--project-name',project,'--env-file',env,'-f','deployment/compose.production.yaml','-f',pinned];
 const dc=args=>docker([...compose,...args]);
 const json=args=>JSON.parse(docker(args));
 const kinds=['container','network','volume'];
 // Labels alone are insufficient: Compose can reuse an existing unlabeled named volume.
 const names={container:`^/?${project}[-_](postgres|migrate|api|frontend|key_restore)([-_][0-9]+)?$`,network:`^${project}_(backend|edge)$`,volume:`^${project}_(database|keys)$`};
 const resources=()=>kinds.flatMap(kind=>['label=com.docker.compose.project='+project,'name='+names[kind]].map(filter=>docker([kind,'ls',...(kind==='container'?['--all']:[]),'--filter',filter,'--quiet']).toString().trim()));
 const inspectServices=()=>{const ids=docker(['container','ls','--all','--no-trunc','--filter',`label=com.docker.compose.project=${project}`,'--quiet']).toString().trim().split(/\s+/);if(!ids.length||ids.some(id=>!/^[-a-zA-Z0-9]+$/.test(id)))fail();const all=json(['inspect',...ids]);if(all.length!==ids.length||all.some(c=>!ids.includes(c.Id)))fail();return all;};
 const identity=c=>{const s=c.Config?.Labels?.['com.docker.compose.service'];if(c.Config?.Labels?.['com.docker.compose.project']!==project||!['postgres','api','migrate','frontend'].includes(s)||c.Config.Image!==m.imageIds[s==='migrate'?'api':s]||c.Image!==m.imageIds[s==='migrate'?'api':s]||(s!=='postgres'&&c.Config.Labels['org.opencontainers.image.revision']!==m.commit))fail();return s;};
 const helper=(command,input)=>docker(['run','--rm','--pull','never','--name',project+'_key_restore','--label',`com.docker.compose.project=${project}`,'--label','com.docker.compose.service=key-restore','--network','none','--read-only','--cap-drop','ALL',...(input?['--cap-add','CHOWN']:[]),'--security-opt','no-new-privileges:true','--user',input?'0':'1654:1654','--mount',`type=volume,src=${project}_keys,dst=/keys`,'--entrypoint','/bin/sh',...(input?['-i']:[]),m.imageIds.postgres,'-ec',command],input);
 try{
  if(!/^nexus_s10_restore_[a-z0-9_]+$/.test(project))fail();validateRestoreConfig(r);
  if(!files['includes/database-password']?.length)fail();
  writeFileSync(secret,files['includes/database-password'],{mode:0o444,flag:'wx'});
  chmodSync(secret,0o444); // Exact file-backed secret mode, independent of host umask; stage is 0700.
  const values={NEXUS_COMMIT:m.commit,NEXUS_HOST:r.host,NEXUS_BIND_IP:r.bindIp,NEXUS_PORT:r.port,NEXUS_SUBNET:r.backendSubnet,NEXUS_DYNAMIC_RANGE:r.backendDynamicRange,NEXUS_FRONTEND_IP:r.frontendIp,NEXUS_EDGE_SUBNET:r.edgeSubnet,NEXUS_EDGE_DYNAMIC_RANGE:r.edgeDynamicRange,NEXUS_EDGE_PROXY:r.edgeProxy,NEXUS_SECRET_FILE:secret.replaceAll('\\','/')};
  // dotenv single quoting prohibits interpolation; refuse paths which cannot be encoded unambiguously.
  if(Object.values(values).some(v=>/[\r\n\0'$]/.test(String(v))))fail();
  writeFileSync(env,Object.entries(values).map(([k,v])=>`${k}='${v}'`).join('\n')+'\n',{mode:0o600,flag:'wx'});
  writeFileSync(pinned,JSON.stringify({services:Object.fromEntries(['postgres','migrate','api','frontend'].map(s=>[s,{image:m.imageIds[s==='migrate'?'api':s]}]))}),{mode:0o600,flag:'wx'});
  if(resources().some(Boolean))fail();
  for(const s of ['api','frontend','postgres']){const images=json(['image','inspect',m.imageIds[s]]);if(images.length!==1||images[0].Id!==m.imageIds[s])fail();}
  const networkIds=docker(['network','ls','--quiet']).toString().trim().split(/\s+/).filter(Boolean);
  if(networkIds.some(id=>!/^[-a-zA-Z0-9]+$/.test(id)))fail();
  const networks=networkIds.length?json(['network','inspect',...networkIds]):[];
  if(networks.length!==networkIds.length)fail();
  const existing=networks.flatMap(n=>{const config=n.IPAM?.Config;if(config==null)return [];if(!Array.isArray(config))fail();return config.flatMap(c=>{if(typeof c.Subnet!=='string'||c.IPRange!==undefined&&typeof c.IPRange!=='string')fail();return [c.Subnet,...(c.IPRange?[c.IPRange]:[])];});});
  validateRestoreConfig(r,existing);
  auditRestoreCompose(JSON.parse(dc(['config','--format','json'])),{project,config:r,metadata:m,secret,root});
  run(process.execPath,['--input-type=module','-e',portProbe,r.bindIp,String(r.port)]);
  // Set before the first mutation: even a failed up can have created resources.
  begun=true;
  dc(['up','--detach','--no-build','--pull','never','--wait','--wait-timeout','120','postgres']);
  let all=inspectServices();if(all.length!==1||identity(all[0])!=='postgres'||all[0].State.Health?.Status!=='healthy'||all[0].State.Status!=='running')fail();
  const pg=all[0].Id;
  if(docker(psqlArgs(pg,emptyDatabaseSql)).toString().trim()!=='0')fail();
  docker(['exec','-i',pg,'pg_restore','--exit-on-error','--no-owner','--no-acl','-U','nexus','-d','nexus'],files['database.dump']);
  docker(['volume','create','--label',`com.docker.compose.project=${project}`,'--label','com.docker.compose.volume=keys',project+'_keys']);
  helper('tar -xf - -C /keys --no-same-owner && chmod 0600 /keys/key-*.xml && chown -R 1654:1654 /keys',files['keys.tar']);
  const fingerprint=()=>keyFingerprint(helper('tar -cf - -C /keys .'));
  if(fingerprint()!==m.keyFingerprint)fail();
  dc(['up','--no-deps','--no-build','--pull','never','--abort-on-container-exit','--exit-code-from','migrate','migrate']);
  all=inspectServices();if(all.length!==2||!all.every(c=>['postgres','migrate'].includes(identity(c))))fail();
  const migration=all.find(c=>identity(c)==='migrate');if(!migration||migration.State.Status!=='exited'||migration.State.ExitCode!==0)fail();
  dc(['up','--detach','--no-deps','--no-build','--pull','never','--wait','--wait-timeout','120','api','frontend']);
  all=inspectServices();all.forEach(identity);
  auditRuntime(all,r.bindIp,{frontendPort:r.port,project,secretFile:secret});
  for(const c of all){
   const h=c.HostConfig;
   for(const k of ['CapAdd','CapDrop','Devices','DeviceRequests','VolumesFrom','Links','ExtraHosts','Dns','DnsSearch','DnsOptions'])assert.deepEqual(h[k]??[],[]);
   for(const k of ['PidMode','UTSMode','UsernsMode','CgroupParent'])assert.equal(h[k]??'','');
   assert.ok([undefined,'private'].includes(h.IpcMode));
   const s=identity(c);const expected=s==='frontend'?[project+'_backend',project+'_edge']:[project+'_backend'];assert.deepEqual(Object.keys(c.NetworkSettings.Networks).sort(),expected.sort());if(s==='frontend')assert.equal(c.NetworkSettings.Networks[project+'_backend'].IPAddress,r.frontendIp);}
  if(!sameAggregates(parseAggregates(docker(psqlArgs(pg,aggregateSql))),m.aggregates))fail();
  const url=`http://${r.bindIp==='::1'?'[::1]':r.bindIp}:${r.port}/api/auth/status`;
  const status=JSON.parse(run(process.execPath,['--input-type=module','-e',statusProbe,url,r.host]));
  if(status.requiresBootstrap!==(m.aggregates.accounts===0)||status.registrationAvailable!==false)fail();
  if(run(process.execPath,['--input-type=module','-e',frontendProbe,new URL('/',url).href,r.host]).toString()!=='frontend verified')fail();
  if(fingerprint()!==m.keyFingerprint)fail();
 }catch{primary=Error('Recovery operation refused; inspect private configuration and exact-project recovery state.');}
 finally{
  if(begun){
   let downOk=true;try{dc(['down','--volumes','--remove-orphans']);}catch{downOk=false;}
   try{if(resources().some(Boolean)||!downOk)fail();}
   catch{const e=Error(`Disposable cleanup unverified for ${project}. Recover only this exact project using its retained private restore environment; verify all labeled resources absent before removing recovery material.`);e.code='NEXUS_RESTORE_CLEANUP';if(primary)throw new AggregateError([primary,e],'Restore and cleanup failed');throw e;}
  }
 }
 if(primary)throw primary;
}
function auditBuildContext(context,root){
 if(resolve(context)===resolve(root))return;
 // Compose canonicalizes the held Linux candidate fd. Only that exact
 // canonical spelling is an alternative, never an arbitrary symlink alias.
 assert.match(root,/^\/proc\/[1-9][0-9]*\/fd\/[1-9][0-9]{0,5}$/);
 const canonical=fs.realpathSync(root);
 assert.equal(resolve(context),canonical);
 const held=fs.statSync(root,{bigint:true}),rendered=fs.statSync(canonical,{bigint:true});
 assert.ok(held.isDirectory()&&rendered.isDirectory());
 assert.equal(held.dev,rendered.dev);assert.equal(held.ino,rendered.ino);
}

