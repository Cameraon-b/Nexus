import {spawn,spawnSync} from 'node:child_process';
import {dirname} from 'node:path';
// Test-only launcher for the offline musl runtime on WSL; no production hook.
export function spawnNodeSync(args,options){
 const loader=process.platform==='linux'&&process.env.NEXUS_TEST_NODE_LOADER;
 return loader?spawnSync(loader,['--library-path',dirname(loader),process.env.NEXUS_TEST_NODE_EXECUTABLE??process.execPath,...args],options):spawnSync(process.execPath,args,options);
}
export function spawnNode(args,options){
 const loader=process.platform==='linux'&&process.env.NEXUS_TEST_NODE_LOADER;
 return loader?spawn(loader,['--library-path',dirname(loader),process.env.NEXUS_TEST_NODE_EXECUTABLE??process.execPath,...args],options):spawn(process.execPath,args,options);
}
