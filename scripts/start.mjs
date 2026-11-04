import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { startApi } from './api.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const setup=spawnSync(process.execPath,['scripts/setup.mjs'],{cwd:root,stdio:'inherit'});
if(setup.status!==0)process.exit(setup.status??1);
let api,server;
async function available(url){try{return await fetch(url,{signal:AbortSignal.timeout(1500)});}catch{return null;}}
try {
 const current=await available('http://127.0.0.1:5080/api/auth/status');
 if(!current?.ok){
  api=startApi();
  let ready=false;
  for(let attempt=0;attempt<60;attempt++){
   if(api.exitCode!==null)throw new Error('Nexus API exited during startup.');
   if((await available('http://127.0.0.1:5080/api/auth/status'))?.ok){ready=true;break;}
   await delay(500);
  }
  if(!ready)throw new Error('API did not become ready; check PostgreSQL and the API output.');
 }
 const ui=await available('http://127.0.0.1:5174');
 if(ui?.ok){
  if(!(await ui.text()).includes('Nexus · AETHER workspace'))throw new Error('Port 5174 is occupied by another application.');
  console.log('Using the existing Nexus frontend.');
 }else{
  server=await createServer({root,server:{host:'127.0.0.1',port:5174,strictPort:true,open:process.argv.includes('--open')}});
  await server.listen();
 }
 console.log('\nNexus workspace: http://127.0.0.1:5174/');
 console.log('Sample prototype: http://127.0.0.1:5174/demo');
 console.log('Create your first admin account in the browser. No sample accounts are created in the real workspace.');
 if(api)api.on('exit',code=>{if(code)console.error('API stopped:',code);});
}catch(error){api?.kill();await server?.close();console.error(error.message);process.exitCode=1;}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{api?.kill(signal);await server?.close();process.exit(0);});
