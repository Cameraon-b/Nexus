import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {packTar,keyFingerprint} from '../production-recovery.mjs';
import {aggregates} from './recovery.mjs';
export const project='nexus_s10_restore_fixture';
import {keyName,keyXml} from './data-protection.mjs';
export const keys=packTar({[keyName]:Buffer.from(keyXml)});
const sha='a'.repeat(40),id='sha256:'+'e'.repeat(64);
export const metadata={commit:sha,images:{api:'nexus-api:'+sha,frontend:'nexus-frontend:'+sha,postgres:'postgres:18@sha256:979bccfde35445db618c65107d27d08c6c21339d8dc3ad4c830c6633947be0e4'},imageIds:{api:id,frontend:id,postgres:id},aggregates,keyFingerprint:keyFingerprint(keys),migrationCount:3};
export function fakeRestore({root,stage,config,mutate=(x)=>x}){
 const calls=[];let services=[],down=false;
 const containerId=s=>({postgres:'a',migrate:'b',api:'c',frontend:'d'}[s]).repeat(64);
 const container=s=>({Id:containerId(s),Image:id,Config:{Image:metadata.imageIds[s==='migrate'?'api':s],User:s==='postgres'?'':s==='frontend'?'101':'app',Labels:{'org.opencontainers.image.revision':sha,'com.docker.compose.project':project,'com.docker.compose.service':s}},State:{Status:s==='migrate'?'exited':'running',ExitCode:0,Health:{Status:'healthy'}},HostConfig:{ReadonlyRootfs:s!=='postgres',Privileged:false,NetworkMode:project+'_backend',SecurityOpt:['no-new-privileges:true'],Tmpfs:s==='postgres'?{}:{'/tmp':''},PortBindings:s==='frontend'?{'8080/tcp':[{HostIp:config.bindIp,HostPort:String(config.port)}]}:{}},Mounts:s==='frontend'?[]:[{Type:'bind',Source:join(stage,'database-password'),Destination:'/run/secrets/database_password',RW:false},...(['api','postgres'].includes(s)?[{Type:'volume',Source:'/docker/volumes/fake',Name:project+'_'+(s==='api'?'keys':'database'),Destination:s==='api'?'/keys':'/var/lib/postgresql',RW:true}]:[])],NetworkSettings:{Networks:s==='frontend'?{[project+'_backend']:{IPAddress:config.frontendIp},[project+'_edge']:{}}:{[project+'_backend']:{}}}});
 const run=(exe,args,options={})=>{
  const call={exe,args,options,down,index:calls.length};calls.push(call);
  let result;
  if(exe!== 'docker')result=args.some(a=>a.includes('await verifyFrontend'))?'frontend verified':args.at(-1)==='localhost'?JSON.stringify({requiresBootstrap:aggregates.accounts===0,registrationAvailable:false}):'';
  else if(args[1]==='ls')result=args[0]==='container'?services.map(s=>containerId(s).slice(0,args.includes('--no-trunc')?64:12)).join('\n'):args[0]==='network'&&!args.includes('--filter')?'bridge-id\nhost-id':'';
  else if(args[0]==='network'&&args[1]==='inspect')result=JSON.stringify([{IPAM:{Config:[{Subnet:'172.17.0.0/16'}]}},{IPAM:{Config:null}}]);
  else if(args[0]==='image')result=JSON.stringify([{Id:id}]);
  else if(args.includes('config')){
   const c=JSON.parse(readFileSync(new URL('./restore-compose.json',import.meta.url)));
   c.secrets.database_password.file=join(stage,'database-password').replaceAll('\\','/');
   for(const [name,s] of Object.entries(c.services)){if(s.build)s.build.context=root;s.image=metadata.imageIds[name==='migrate'?'api':name];}
   result=JSON.stringify(c);
  }else if(args.includes('up')){if(args.at(-1)==='postgres')services=['postgres'];else if(args.at(-1)==='migrate')services.push('migrate');else services.push('api','frontend');result='';}
  else if(args.includes('down')){down=true;services=[];result='';}
  else if(args.includes('ps'))result=services.map(s=>'id-'+s).join('\n');
  else if(args[0]==='inspect')result=JSON.stringify(services.map(container));
  else if(args.includes('psql'))result=args.at(-1).includes('pg_class')?'0':JSON.stringify(aggregates);
  else if(args[0]==='exec'&&args.includes('pg_restore'))result='';
  else if(args[0]==='volume'&&args[1]==='create')result=project+'_keys';
  else if(args[0]==='run')result=args.at(-1).startsWith('tar -cf')?keys:'';
  else throw Error('Unexpected fake command');
  return Buffer.from(mutate(Buffer.from(result),call)??result);
 };
 return {run,calls};
}
