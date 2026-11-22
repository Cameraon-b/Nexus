import {ensureRuntime} from './runtime.mjs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
const defaultRoot=fileURLToPath(new URL('../',import.meta.url));
export function startApi({root=defaultRoot,port='5080',database}={}) {
const runtime=ensureRuntime(root);
port=String(port);
if(!/^\d{4,5}$/.test(port)||Number(port)>65535)throw new Error('Invalid NEXUS_API_PORT.');
if(database&&!/^nexus_ui_test_[a-f0-9]{32}$/.test(database))throw new Error('Test database must have a unique nexus_ui_test_ prefix.');
const keys=`${root}/.local/${database?`test-keys/${database}`:'keys'}`;
for(const dir of [keys,`${root}/.local/dotnet-home`,`${root}/.cache/tmp`])mkdirSync(dir,{recursive:true});
const executable=process.platform==='win32'?`${root}/.tools/dotnet/dotnet.exe`:'dotnet';
const configuration=database?'Release':'Debug';
const dll=`${root}/backend/Nexus.Api/bin/${configuration}/net10.0/Nexus.Api.dll`;
if(!existsSync(dll))throw new Error('API has not been built. Run npm run setup first.');
const child=spawn(executable,[dll,'--contentRoot',`${root}/backend/Nexus.Api`],{cwd:root,stdio:'inherit',env:{...process.env,DOTNET_ROOT:`${root}/.tools/dotnet`,DOTNET_CLI_HOME:`${root}/.local/dotnet-home`,DOTNET_CLI_TELEMETRY_OPTOUT:'1',TMP:`${root}/.cache/tmp`,TEMP:`${root}/.cache/tmp`,ASPNETCORE_ENVIRONMENT:'Development',ASPNETCORE_URLS:`http://127.0.0.1:${port}`,ConnectionStrings__Nexus:database?runtime.connectionString.replace('Database=nexus;',`Database=${database};`):runtime.connectionString,Nexus__DataProtectionPath:keys}});
return child;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
const child=startApi({port:process.env.NEXUS_API_PORT,database:process.env.NEXUS_TEST_DATABASE});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
}
