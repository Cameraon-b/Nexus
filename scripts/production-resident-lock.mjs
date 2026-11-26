import {processIdentity,assertProcessIdentity} from './production-process-identity.mjs';
// Shared closed protocol for cached Linux/Windows lifetime helpers.
const fail=(code='NEXUS_OPERATION_LOCK_CLEANUP')=>Object.assign(Error('Operation lock could not be verified'),{code});
export function checkedStep(release,step){
 release?.check?.();
 let value,primary;
 try{value=step();}catch(error){primary=error;}
 try{release?.check?.();}catch(cleanup){if(primary)throw new AggregateError([primary,cleanup],'Operation and liveness check failed');throw cleanup;}
 if(primary)throw primary;
 return value;
}
export async function residentLock(child,input,{timeout=30000,recovery=false}={}){
 let inputs;
 let buffer='',total=0,failed=false,closed=false,stdoutClosed=false,code,signal,pending,terminal;
 const finish=()=>{
  if(!closed||!stdoutClosed||!terminal)return;
  if(failed||buffer||code!==0||signal)terminal.reject(fail());else terminal.resolve();
  terminal=undefined;
 };
 const stop=()=>{failed=true;pending?.reject(fail());pending=undefined;terminal?.reject(fail());terminal=undefined;child.kill();};
 child.on('error',stop);child.stdin.on('error',stop);child.stderr.on('data',stop);
 // exit is not a stream barrier. Only child close AND stdout close are terminal.
 child.on('close',(c,s)=>{closed=true;code=c;signal=s;if(pending){pending.reject(fail());pending=undefined;}finish();});
 child.stdout.on('close',()=>{stdoutClosed=true;finish();});
 child.stdout.on('data',chunk=>{
  total+=chunk.length;if(total>1024)return stop();buffer+=chunk.toString('utf8');
  const end=buffer.indexOf('\n');if(end<0)return;
  const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
  const match=/^\{"status":"(acquired|released|recovered|absent|locked|cleanup|refused)"\}$/.exec(line);
  const pinned=/^\{"status":"acquired","config":"(\/proc\/([1-9][0-9]*)\/fd\/[1-9][0-9]{0,5})","candidate":"(\/proc\/([1-9][0-9]*)\/fd\/[1-9][0-9]{0,5})"\}$/.exec(line);
  if(buffer||!pending||(!match&&!pinned))return stop();
  if(pinned){if(inputs||pinned[2]!==String(child.pid)||pinned[4]!==String(child.pid))return stop();inputs=Object.freeze({config:pinned[1],candidate:pinned[3]});}
  const p=pending;pending=undefined;p.resolve(match?.[1]??'acquired');
 });
 function exchange(message){
  if(failed||closed)return Promise.reject(fail());
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(stop,timeout);
   pending={resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}};
   child.stdin.write(message);
  });
 }
 function cleanClose(){
  child.stdin.end();
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(stop,timeout);
   terminal={resolve:()=>{clearTimeout(timer);resolve();},reject:e=>{clearTimeout(timer);reject(e);}};
   finish();
  });
 }
 try{
  const status=await exchange(input);
  if(recovery||status!=='acquired'){
   await cleanClose();
   if(recovery&&['recovered','absent'].includes(status))return status;
   if(status==='locked')throw fail('NEXUS_OPERATION_LOCKED');
   throw fail();
  }
 }catch(e){child.stdin.end();child.kill();throw e;}
 const helperIdentity=processIdentity(child.pid);
 let completion;
 const release=()=>completion??=(async()=>{
  try{if(await exchange('{"action":"release"}\n')!=='released')throw fail();await cleanClose();}
  catch{child.stdin.end();child.kill();throw fail();}
 })();
 release.inputs=inputs;
 release.helperPid=child.pid; // Programmatic disposable-fixture observation; never printed.
 release.check=()=>{if(failed||closed||child.exitCode!==null||child.signalCode!==null)throw fail();assertProcessIdentity(helperIdentity);};
 return release;
}
