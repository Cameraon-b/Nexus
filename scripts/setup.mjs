import {ensureRuntime} from './runtime.mjs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const runtime=ensureRuntime(root);
const database=spawnSync('docker',['compose','up','-d','--wait','postgres'],{cwd:root,stdio:'inherit',env:{...process.env,NEXUS_POSTGRES_PASSWORD:runtime.postgresPassword}});
if(database.status!==0) process.exit(database.status??1);
console.log('PostgreSQL is ready. Database files and generated credentials are under .local/ (Git-ignored).');
if(!process.argv.includes('--database-only')) {
 const restore=spawnSync(process.execPath,['scripts/dotnet.mjs','restore','backend/Nexus.Api/Nexus.Api.csproj'],{cwd:root,stdio:'inherit'});
 if(restore.status!==0)process.exit(restore.status??1);
 const build=spawnSync(process.execPath,['scripts/dotnet.mjs','build','backend/Nexus.Api/Nexus.Api.csproj','--no-restore'],{cwd:root,stdio:'inherit'});
 process.exit(build.status??1);
}
