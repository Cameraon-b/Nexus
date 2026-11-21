import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {createServer} from 'vite';
import {startApi} from './api.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const database=`nexus_ui_test_${randomUUID().replaceAll('-','')}`;
const sql=(query)=>{
 const result=spawnSync('docker',['exec','nexus-postgres-1','psql','-U','nexus','-d','postgres','-v','ON_ERROR_STOP=1','-c',query],{cwd:root,stdio:'inherit'});
 if(result.status!==0)throw new Error('Test database command failed.');
};
let api,ui,created=false;
try {
 const build=spawnSync(process.execPath,['scripts/dotnet.mjs','build','backend/Nexus.Api/Nexus.Api.csproj'],{cwd:root,stdio:'inherit'});
 if(build.status!==0)throw new Error('API build failed.');
 sql(`CREATE DATABASE ${database}`);created=true;
 api=startApi({port:'5081',database});
 let ready=false;
 for(let i=0;i<90;i++){
  if(api.exitCode!==null)throw new Error('Test API exited.');
  try{const r=await fetch('http://127.0.0.1:5081/api/auth/status',{signal:AbortSignal.timeout(1000)});if(r.ok){ready=true;break;}}catch{}
  await delay(500);
 }
 if(!ready)throw new Error('Test API startup timed out.');
 ui=await createServer({root,server:{host:'127.0.0.1',port:5176,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:5081',changeOrigin:false}}}});
 await ui.listen();
 const child=spawn(process.execPath,['node_modules/playwright/cli.js','test','--config','playwright.live.config.ts',...process.argv.slice(2)],{cwd:root,stdio:'inherit',env:{...process.env,NEXUS_UI_TEST:'1',NEXUS_UI_DATABASE:database,PLAYWRIGHT_BROWSERS_PATH:`${root}/.browsers`,TMP:`${root}/.cache/tmp`,TEMP:`${root}/.cache/tmp`}});
 const [code]=await once(child,'exit');process.exitCode=code??1;
}catch(error){console.error(error.message);process.exitCode=1;}
finally{
 await ui?.close();
 if(api&&api.exitCode===null){const exit=once(api,'exit');api.kill();await exit;}
 if(created)sql(`DROP DATABASE ${database} WITH (FORCE)`);
}
