import {ensureRuntime} from './runtime.mjs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const runtime=ensureRuntime(root);
const result=spawnSync(process.execPath,['scripts/dotnet.mjs','test','backend/Nexus.Tests/Nexus.Tests.csproj',...process.argv.slice(2)],{cwd:root,stdio:'inherit',env:{...process.env,NEXUS_TEST_ADMIN_CONNECTION:runtime.adminConnectionString}});
process.exit(result.status??1);
