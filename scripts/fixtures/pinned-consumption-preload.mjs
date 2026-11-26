// Synthetic subprocess-only race injection. No production argv/env switch exists.
import {registerHooks} from 'node:module';
import {readFileSync,renameSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
globalThis.replaceSyntheticCustody=release=>{
 const {custody,config,root}=JSON.parse(process.env.NEXUS_DISPOSABLE_RACE);
 if(!custody.includes('.nexus-consumption-'))throw Error('Not a disposable fixture');
 const originalEnv=readFileSync(config,'utf8'),originalCompose=readFileSync(join(root,'deployment/compose.production.yaml'),'utf8');
 renameSync(custody,custody+'-held');mkdirSync(join(root,'deployment'),{recursive:true,mode:0o700});mkdirSync(dirname(config),{recursive:true,mode:0o700});
 writeFileSync(config,originalEnv.replace('NEXUS_PROOF=original','NEXUS_PROOF=replacement').replace('a'.repeat(40),'b'.repeat(40)),{mode:0o600});
 writeFileSync(join(root,'deployment/compose.production.yaml'),originalCompose+'\nx-nexus-proof: replacement\n');
 writeFileSync(process.env.NEXUS_DISPOSABLE_PINNED,JSON.stringify(release.inputs));
 return release;
};
registerHooks({load(url,context,next){
 if(url.endsWith('/production-operations.mjs')){
  const source=readFileSync(new URL(url),'utf8').replace('return acquireCustodyLock(project,config,directory,options);','return acquireCustodyLock(project,config,directory,options).then(globalThis.replaceSyntheticCustody);');
  return {format:'module',shortCircuit:true,source};
 }
 return next(url,context);
}});
