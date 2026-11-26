import {test} from 'node:test';
import {homedir} from 'node:os';
import {sealCandidate,removeFixture} from './fixtures/operation-candidate.mjs';
import {bindOperationCustody,acquireCustodyLock} from './production-lock-custody.mjs';
import {checkedStep} from './production-resident-lock.mjs';
import {generateKeyPairSync} from 'node:crypto';
for(const type of ['file','directory'])test('round6: producer later publication failure preserves public replacement '+type,()=>fixture(f=>{
 let first,links=0;assert.throws(()=>backup({...f,project:'nexus_prod_example',publication:{link:(source,target)=>{
  if(++links===1)first=target;
  if(links===3){unlinkSync(first);if(type==='directory'){mkdirSync(first);writeFileSync(join(first,'evidence'),'replacement');}else writeFileSync(first,'replacement');throw Error('later publication');}
  linkSync(source,target);
 }}}),e=>e.code==='NEXUS_PUBLICATION_CLEANUP');assert.equal(readFileSync(type==='directory'?join(first,'evidence'):first,'utf8'),'replacement');assert.equal(readdirSync(f.config.output).length,2);
}));
test('round6: producer rejects key identity drift even with identical bytes',()=>{
 for(const key of ['signingKey','verificationKey'])for(const point of ['config','pg_dump','start','--encrypt'])fixture(f=>{
  let changed=false;assert.throws(()=>backup({...f,project:'nexus_prod_example',run:(e,a,o)=>{const result=f.run(e,a,o);if(!changed&&a.includes(point)){const bytes=readFileSync(f.config[key]);unlinkSync(f.config[key]);writeFileSync(f.config[key],bytes);changed=true;}return result;}}));assert.ok(changed);
 });
});
test('round6: matched signing and verification key substitution after snapshot refuses',()=>fixture(f=>{
 const pair=generateKeyPairSync('ed25519');let changed=false;
 assert.throws(()=>backup({...f,project:'nexus_prod_example',run:(e,a,o)=>{const result=f.run(e,a,o);if(!changed&&e===f.config.age){writeFileSync(f.config.signingKey,pair.privateKey.export({type:'pkcs8',format:'pem'}));writeFileSync(f.config.verificationKey,pair.publicKey.export({type:'spki',format:'pem'}));changed=true;}return result;}}));assert.ok(changed);
}));
test('round6: post-publication key drift preserves public evidence and suppresses success',()=>fixture(f=>{
 let changed=false;assert.throws(()=>backup({...f,project:'nexus_prod_example',publication:{link:(source,target)=>{linkSync(source,target);if(source.endsWith('.signature.json')){const bytes=readFileSync(f.config.verificationKey);unlinkSync(f.config.verificationKey);writeFileSync(f.config.verificationKey,bytes);changed=true;}}}}),e=>e.code==='NEXUS_PUBLICATION_CLEANUP');assert.ok(changed);assert.equal(readdirSync(f.config.output).length,4);
}));
import {spawnNodeSync} from './fixtures/spawn-node.mjs';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync,linkSync,unlinkSync,existsSync,truncateSync,lstatSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {backup,parseRecoveryOptions,restoreVerify,execute,publish} from './production-backup.mjs';
import {externalPath,packTar,unpackTar,includeNames,validatePlaintext,hash} from './production-recovery.mjs';
import {verifyEnvelope,maxCiphertextBytes,signEnvelope} from './production-envelope.mjs';
import {aggregates} from './fixtures/recovery.mjs';
import {testPrivateKey,testPublicKey} from './fixtures/signing.mjs';
import {keyName,keyXml} from './fixtures/data-protection.mjs';
import {certificateTestKey,recoveryIncludes} from './fixtures/recovery-includes.mjs';
import {fakeRestore} from './fixtures/restore-runner.mjs';
test('round3: stable wrong recipient refuses before Docker or encryption',()=>fixture(f=>{
 f.config.recipientFingerprint=hash('approved-recipient');
 assert.throws(()=>backup({...f,project:'nexus_prod_example'}));assert.equal(f.calls.length,0);
}));
test('round3: producer final verification refuses validly re-signed recipient substitution',()=>fixture(f=>{
 let substituted=false;
 assert.throws(()=>backup({...f,project:'nexus_prod_example',publication:{link:(source,target)=>{
  if(source.endsWith('.metadata.json')){
   const m=JSON.parse(readFileSync(source));m.recipientFingerprint='f'.repeat(64);const bytes=Buffer.from(JSON.stringify(m)+'\n');writeFileSync(source,bytes);
   // Ciphertext was already published, so read the exact published bytes.
   const name=readdirSync(f.config.output).find(n=>n.endsWith('.tar.age'));
   writeFileSync(source.replace('.metadata.json','.signature.json'),signEnvelope(name,m,readFileSync(join(f.config.output,name)),bytes,testPrivateKey));substituted=true;
  }
  linkSync(source,target);
 }}}));assert.ok(substituted);assert.equal(readdirSync(f.config.output).length,4);
}));
test('round3: independently pinned verify-backup CLI and restore refuse signed mismatch before decryption',()=>fixture(f=>{
 const n=backup({...f,project:'nexus_prod_example',now:()=>new Date('2026-01-01T00:00:00Z')});
 const backupConfig=join(f.dir,'backup.json'),restoreConfig=join(f.dir,'restore.json'),identity=join(f.dir,'identity'),tempRoot=join(f.dir,'temp');mkdirSync(tempRoot);writeFileSync(identity,'fake');
 writeFileSync(restoreConfig,JSON.stringify({identity,tempRoot,sourceProject:'nexus_prod_example',host:'localhost',bindIp:'127.0.0.1',port:49991,backendSubnet:'10.251.10.0/24',backendDynamicRange:'10.251.10.128/25',frontendIp:'10.251.10.2',edgeSubnet:'10.251.11.0/24',edgeDynamicRange:'10.251.11.128/25',edgeProxy:'10.251.11.2'}));
 writeFileSync(backupConfig,JSON.stringify({...f.config,recipientFingerprint:hash('wrong independent pin')}));
 const artifact=join(f.config.output,n.artifact);
 let earlyDecryptions=0;assert.throws(()=>restoreVerify({project:'nexus_s10_restore_fixture',root:f.root,backupConfig,restoreConfig,artifact,run:()=>{earlyDecryptions++;throw Error('must not decrypt');}}));assert.equal(earlyDecryptions,0);
 const result=spawnNodeSync(['scripts/production.mjs','verify-backup','--project','nexus_prod_example','--config-file',f.env,'--backup-config',backupConfig,'--artifact',artifact]);assert.notEqual(result.status,0);
 writeFileSync(backupConfig,JSON.stringify(f.config));
 const approved=spawnNodeSync(['scripts/production.mjs','verify-backup','--project','nexus_prod_example','--config-file',f.env,'--backup-config',backupConfig,'--artifact',artifact]);assert.equal(approved.status,0);
}));
for(const kind of ['backup-config','verification-key','restore-identity','restore-verifier'])for(const mutation of ['replacement','in-place'])test('round14 accepted '+kind+' refuses '+mutation+' before next boundary',()=>fixture(f=>{
 const backupConfig=join(f.dir,'boundary-backup.json');writeFileSync(backupConfig,JSON.stringify(f.config));
 const mutate=path=>{const bytes=readFileSync(path);if(mutation==='replacement')unlinkSync(path);writeFileSync(path,mutation==='replacement'?bytes:Buffer.concat([bytes,Buffer.from('\n ')]));};
 if(!kind.startsWith('restore-')){
  let changed=false;const {config,...input}=f;
  assert.throws(()=>backup({...input,backupConfig,project:'nexus_prod_example',run:(e,a,o)=>{const value=f.run(e,a,o);if(a.includes('stop')){mutate(kind==='backup-config'?backupConfig:f.config.verificationKey);changed=true;}return value;}}));
  assert.ok(changed);assert.ok(f.calls.some(([,a])=>a.includes('start')));assert.ok(!f.calls.some(([e])=>e===f.config.age));assert.deepEqual(readdirSync(f.config.output),[]);
 }else{
  const n=backup({...f,project:'nexus_prod_example'}),identity=join(f.dir,'boundary-identity'),tempRoot=join(f.dir,'boundary-temp'),restoreConfig=join(f.dir,'boundary-restore.json');mkdirSync(tempRoot);writeFileSync(identity,'exact identity');
  writeFileSync(restoreConfig,JSON.stringify({identity,tempRoot,sourceProject:'nexus_prod_example',host:'localhost',bindIp:'127.0.0.1',port:49991,backendSubnet:'10.251.10.0/24',backendDynamicRange:'10.251.10.128/25',frontendIp:'10.251.10.2',edgeSubnet:'10.251.11.0/24',edgeDynamicRange:'10.251.11.128/25',edgeProxy:'10.251.11.2'}));
  let decryptions=0;assert.throws(()=>restoreVerify({project:'nexus_s10_restore_fixture',root:f.root,backupConfig,restoreConfig,artifact:join(f.config.output,n.artifact),run:(e,a,o)=>{assert.equal(e,f.config.age);assert.equal(o.input.toString(),'exact identity');decryptions++;mutate(kind==='restore-identity'?identity:f.config.verificationKey);return readFileSync(a.at(-1));}}));assert.equal(decryptions,1);assert.deepEqual(readdirSync(tempRoot),[]);assert.equal(readdirSync(f.config.output).length,4);
 }
}));
for(const point of ['config','stop'])for(const mutation of ['replacement','in-place'])test('round14 Linux real helper production env '+mutation+' at '+point+' refuses and restores availability',{skip:process.platform!=='linux'},async()=>{
 const d=mkdtempSync(join(homedir(),'.nexus-r14-env-'));let release;
 try{
  const seed=join(d,'tools/candidates/seed');mkdirSync(seed,{recursive:true});writeFileSync(join(seed,'reviewed'),'exact',{mode:0o600});const candidate=sealCandidate(seed),env=join(d,'production.env');writeFileSync(env,recoveryIncludes['production.env'],{mode:0o600});
  release=await acquireCustodyLock('nexus_prod_env_'+hash(d),env,bindOperationCustody(env,candidate));
  fixture(f=>{
   f.config.includes.find(i=>i.name==='production.env').source=release.inputs.config;let changed=false;const consumed=[];
   assert.throws(()=>backup({...f,env,project:'nexus_prod_example',pinnedConfig:{original:env,path:release.inputs.config},run:(e,a,o)=>checkedStep(release,()=>{
    if(a.includes('--env-file')){const path=a[a.indexOf('--env-file')+1];consumed.push(readFileSync(path));assert.equal(lstatSync(path).mode&0o777,0o400);}
    const value=f.run(e,a,o);if(a.includes(point)){if(mutation==='replacement')unlinkSync(env);writeFileSync(env,'replacement env',{mode:0o600});changed=true;}return value;
   })}));assert.ok(changed);assert.equal(f.calls.some(([,a])=>a.includes('start')),point==='stop');assert.ok(consumed.length>=(point==='stop'?4:1));for(const bytes of consumed)assert.deepEqual(bytes,Buffer.from(recoveryIncludes['production.env']));assert.deepEqual(readdirSync(f.config.output),[]);
  });
 }finally{if(release)try{await release();}catch{}removeFixture(d,{recursive:true,force:true});}
});
const sha='a'.repeat(40),pg='postgres:18@sha256:979bccfde35445db618c65107d27d08c6c21339d8dc3ad4c830c6633947be0e4';
function fixture(fn){const dir=mkdtempSync(join(tmpdir(),'nexus_s10_backup_'));try{
 const root=join(dir,'repo'),output=join(dir,'backups');mkdirSync(root);mkdirSync(output);
 const includes=includeNames.map(name=>{const source=join(dir,name);writeFileSync(source,recoveryIncludes[name]);return {name,source};});
 const age=join(dir,'age');writeFileSync(age,'fake');const recipient=join(dir,'recipient');writeFileSync(recipient,'fake-public');
 const signingKey=join(dir,'signing.pem'),verificationKey=join(dir,'verification.pem');writeFileSync(signingKey,testPrivateKey);writeFileSync(verificationKey,testPublicKey);
 const config={output,age,recipient,recipientFingerprint:hash('fake-public'),includes,signingKey,verificationKey},env=includes[0].source,calls=[];
 const keys=packTar({[keyName]:Buffer.from(keyXml)});let captures=0,stopped=false;
 const containerId=s=>({api:'a',postgres:'b',frontend:'c',migrate:'d'}[s]).repeat(64);
 const composeConfig=()=>{const c=JSON.parse(readFileSync(new URL('./fixtures/restore-compose.json',import.meta.url)));const text=JSON.stringify(c).replaceAll('nexus_s10_restore_fixture','nexus_prod_example');const out=JSON.parse(text);out.secrets.database_password.file=includes[1].source.replaceAll('\\','/');for(const s of Object.values(out.services))if(s.build)s.build.context=root;return out;};
 const run=(exe,args,options={})=>{calls.push([exe,args,options]);
 if(exe===age){assert.ok(Buffer.isBuffer(options.input),'age must receive archive on stdin');assert.equal(args.at(-1),'-');assert.ok(!readdirSync(output).some(n=>n.endsWith('.partial')));const stage=join(output,readdirSync(output).find(n=>n.includes('.staging-')));assert.ok(!readdirSync(stage).includes('recovery.tar'));writeFileSync(args[args.indexOf('--output')+1],options.input);return Buffer.alloc(0);}
 if(args[0]==='network'&&args[1]==='inspect')return Buffer.from(JSON.stringify([{Name:'nexus_prod_example_backend',Internal:true,Labels:{'com.docker.compose.project':'nexus_prod_example','com.docker.compose.network':'backend'}},{Name:'nexus_prod_example_edge',Internal:false,Labels:{'com.docker.compose.project':'nexus_prod_example','com.docker.compose.network':'edge'}}]));
 if(args.includes('config'))return Buffer.from(JSON.stringify(composeConfig()));
 if(args.includes('ps'))return Buffer.from(['api','postgres','frontend','migrate'].map(containerId).join('\n'));
 if(args.includes('stop')){stopped=true;return Buffer.alloc(0);}if(args.includes('start')){stopped=false;return Buffer.alloc(0);}
 if(args[0]==='inspect')return Buffer.from(JSON.stringify(['api','postgres','frontend','migrate'].map(s=>({Id:containerId(s),Image:'sha256:'+'e'.repeat(64),Config:{Image:s==='postgres'?pg:(s==='frontend'?'nexus-frontend:':'nexus-api:')+sha,User:s==='postgres'?'':s==='frontend'?'101':'app',Entrypoint:s==='frontend'?['/bin/sh','-ec']:s==='postgres'?['docker-entrypoint.sh']:['dotnet','Nexus.Api.dll'],Cmd:s==='frontend'?composeConfig().services.frontend.command.map(v=>v.replaceAll('$$','$')):s==='postgres'?['postgres']:s==='migrate'?['--migrate-only']:null,Labels:{'org.opencontainers.image.revision':sha,'com.docker.compose.project':'nexus_prod_example','com.docker.compose.service':s}},State:{Status:s==='migrate'||stopped&&['api','frontend'].includes(s)?'exited':'running',ExitCode:0,Health:{Status:'healthy'}},HostConfig:{ReadonlyRootfs:s!=='postgres',Privileged:false,NetworkMode:'nexus_prod_example_backend',SecurityOpt:['no-new-privileges:true'],Tmpfs:s==='postgres'?{}:{'/tmp':''},PortBindings:s==='frontend'?{'8080/tcp':[{HostIp:'127.0.0.1',HostPort:'49991'}]}:{}},Mounts:s==='frontend'?[]:[{Type:'bind',Source:includes[1].source,Destination:'/run/secrets/database_password',RW:false},...(['api','postgres'].includes(s)?[{Type:'volume',Source:'/fake/volume',Name:'nexus_prod_example_'+(s==='api'?'keys':'database'),Destination:s==='api'?'/keys':'/var/lib/postgresql',RW:true}]:[])],NetworkSettings:{Networks:s==='frontend'?{nexus_prod_example_backend:{IPAddress:'10.251.10.2'},nexus_prod_example_edge:{}}:{nexus_prod_example_backend:{}}}}))));
 if(args.includes('pg_dump'))return Buffer.from('PGDMPfake');
 if(args.includes('pg_restore'))return Buffer.from('; Archive created');
 if(args.includes('psql'))return Buffer.from(args.at(-1).includes('pg_database_size')?'1024':JSON.stringify(aggregates));
 if(args.includes('tar')){captures++;return keys;}
 throw Error('unexpected');};
 return fn({dir,root,config,env,calls,run,get captures(){return captures;}});
 }finally{rmSync(dir,{recursive:true,force:true});}}
test('round2: hard-linked external inputs with repository build-context aliases refuse; single-link files and directories work',()=>fixture(f=>{
 for(const p of [f.env,f.config.signingKey,f.config.verificationKey,f.config.recipient,f.config.age]){
  const alias=join(f.root,'build-context-alias');linkSync(p,alias);
  try{assert.throws(()=>externalPath(p,f.root));}finally{unlinkSync(alias);}
  assert.equal(externalPath(p,f.root),p);
 }
 assert.equal(externalPath(f.config.output,f.root,true),f.config.output);
}));
test('round2: age receives protected staged recipient bytes, not configured pathname',()=>fixture(f=>{
 const original=readFileSync(f.config.recipient);let checked=false;
 backup({...f,project:'nexus_prod_example',run:(e,a,o)=>{
  if(e===f.config.age){const p=a[a.indexOf('--recipients-file')+1];assert.notEqual(p,f.config.recipient);assert.ok(p.startsWith(f.config.output));assert.deepEqual(readFileSync(p),original);checked=true;}
  return f.run(e,a,o);
 }});assert.ok(checked);assert.equal(readdirSync(f.config.output).length,4);
}));
test('round2: recipient replacement and content drift refuse at include critical points and before publication',()=>{
 for(const point of ['config','pg_dump','start','--encrypt'])for(const mode of ['replace','content'])fixture(f=>{
  let changed=false;
  assert.throws(()=>backup({...f,project:'nexus_prod_example',run:(e,a,o)=>{
   const result=f.run(e,a,o);
   if(!changed&&a.includes(point)){const bytes=readFileSync(f.config.recipient);if(mode==='replace')unlinkSync(f.config.recipient);writeFileSync(f.config.recipient,mode==='replace'?bytes:Buffer.from('changed-recipient'));changed=true;}
   return result;
  }}));assert.ok(changed);assert.deepEqual(readdirSync(f.config.output),[]);
 });
});
test('round2: empty recipient refuses before commands',()=>fixture(f=>{
 writeFileSync(f.config.recipient,'');assert.throws(()=>backup({...f,project:'nexus_prod_example'}));assert.equal(f.calls.length,0);assert.deepEqual(readdirSync(f.config.output),[]);
}));
test('round2: recipient explicit 64 KiB boundary accepts exact bound and refuses larger before commands',()=>{
 for(const size of [65536,65537])fixture(f=>{
  writeFileSync(f.config.recipient,Buffer.alloc(size,65));f.config.recipientFingerprint=hash(Buffer.alloc(size,65));
  if(size===65536)backup({...f,project:'nexus_prod_example'});
  else{assert.throws(()=>backup({...f,project:'nexus_prod_example'}));assert.equal(f.calls.length,0);assert.deepEqual(readdirSync(f.config.output),[]);}
 });
});
test('blocker: oversized producer ciphertext refuses before publication',()=>fixture(f=>{
 let published=0;assert.throws(()=>backup({...f,project:'nexus_prod_example',publication:{link:()=>{published++;throw Error();}},run:(e,a,o)=>{const r=f.run(e,a,o);if(e===f.config.age)truncateSync(a[a.indexOf('--output')+1],maxCiphertextBytes+1);return r;}}));assert.equal(published,0);assert.deepEqual(readdirSync(f.config.output),[]);
}));
test('blocker: atomic include replacement after audit refuses before encryption and restores availability',()=>{
 for(const name of includeNames)fixture(f=>{let swapped=false,restarted=false,encrypted=false;
  assert.throws(()=>backup({...f,project:'nexus_prod_example',run:(e,a,o)=>{
   const r=f.run(e,a,o);if(a.includes('pg_dump')&&!swapped){const p=f.config.includes.find(i=>i.name===name).source;const bytes=readFileSync(p);unlinkSync(p);writeFileSync(p,name==='production.env'?Buffer.concat([bytes,Buffer.from('\n# replaced\n')]):bytes);swapped=true;}
   if(a.includes('start'))restarted=true;if(e===f.config.age)encrypted=true;return r;
  }}));assert.ok(swapped);assert.ok(restarted);assert.equal(encrypted,false);assert.deepEqual(readdirSync(f.config.output),[]);
 });
});
test('round6: publication preserves exact target on source unlink failure',()=>fixture(f=>{
 for(const rollbackFails of [false,true]){
  const source=join(f.dir,'source'),target=join(f.dir,'target');writeFileSync(source,'synthetic');
  assert.throws(()=>publish(source,target,{link:linkSync,unlink:p=>{if(p===source||rollbackFails)throw Error('private-path');unlinkSync(p);}}),e=>e.code==='NEXUS_PUBLICATION_CLEANUP'&&!e.message.includes(f.dir));
  assert.equal(existsSync(target),true);rmSync(target,{force:true});
 }
}));
test('final: backup publication failures preserve dedicated rollback condition',()=>{
 for(const rollbackFails of [false,true])fixture(f=>{
  assert.throws(()=>backup({...f,project:'nexus_prod_example',publication:{link:linkSync,unlink:p=>{if(p.includes('.staging-')||rollbackFails)throw Error('private-path');unlinkSync(p);}}}),e=>e.code==='NEXUS_PUBLICATION_CLEANUP'&&!e.message.includes(f.dir));
  assert.equal(readdirSync(f.config.output).length,1);
 });
});
test('final: availability remains primary when stage cleanup fails',()=>{
 for(const mode of ['restart','cleanup','both'])fixture(f=>{
  assert.throws(()=>backup({...f,project:'nexus_prod_example',cleanup:p=>{if(mode!=='restart')throw Error('private cleanup');rmSync(p,{recursive:true,force:true});},run:(e,a,o)=>{if(mode!=='cleanup'&&a.includes('start'))throw Error('private restart');return f.run(e,a,o);}}),e=>{
   assert.ok(!e.message.includes(f.dir));assert.ok(!e.message.includes('private restart'));
   if(mode==='both')return e.code==='NEXUS_BACKUP_AVAILABILITY'&&e.cleanupUnverified===true&&/cleanup.*unverified/i.test(e.message);
   return e.code===(mode==='restart'?'NEXUS_BACKUP_AVAILABILITY':'NEXUS_RECOVERY_CLEANUP');
  });
 });
});
test('recovery CLI options are explicit and restore is disposable-only with exact confirmation',()=>{
 const args=['--project','nexus_prod_example','--config-file','/private/config','--backup-config','/private/backup'];
 assert.equal(parseRecoveryOptions('backup',args).project,'nexus_prod_example');
 for(const a of [[],[...args,'--unknown','x'],[...args,'--project','x']])assert.throws(()=>parseRecoveryOptions('backup',a));
 assert.throws(()=>parseRecoveryOptions('restore-verify',[...args,'--artifact','/private/a','--confirm-disposable','nexus_prod_example','--restore-config','/private/r']));
 assert.throws(()=>parseRecoveryOptions('verify-backup',args));
 const restore=['--project','nexus_s10_restore_fixture','--backup-config','/private/backup','--artifact','/private/artifact','--restore-config','/private/restore','--confirm-disposable','nexus_s10_restore_fixture'];
 assert.equal(parseRecoveryOptions('restore-verify',restore).env,undefined);
 assert.throws(()=>parseRecoveryOptions('restore-verify',[...restore,'--config-file','/private/source-env']));
 assert.throws(()=>parseRecoveryOptions('restore-verify',restore.map(x=>x==='--confirm-disposable'?'--unknown':x)));
});
test('backup orders exact-project health, dump validation and stable key capture before encryption and publishes valid envelope',()=>fixture(f=>{
 const n=backup({...f,project:'nexus_prod_example',now:()=>new Date('2026-01-01T00:00:00Z')});
 const m=verifyEnvelope(f.config.output,n.artifact,'nexus_prod_example',f.config.verificationKey,f.config.recipientFingerprint);
 assert.equal(m.migrationCount,3);assert.equal(f.captures,2);
 const cmds=f.calls.map(c=>c[1].join(' '));assert.ok(cmds.findIndex(s=>s.includes('pg_restore'))<cmds.findIndex(s=>s.includes('--encrypt')));
 assert.ok(cmds.some(s=>s.includes('exec -i '+'b'.repeat(64)+' pg_restore --list')));
 assert.ok(f.calls.every(c=>Array.isArray(c[1])));assert.equal(readdirSync(f.config.output).length,4);
 validatePlaintext(readFileSync(join(f.config.output,n.artifact)),m);
 assert.ok(!JSON.stringify(m).includes('fake-private'));assert.ok(!JSON.stringify(m).includes(f.dir));
}));
test('review: quiesce/capture/restart order, measured preflight and dedicated restart failure',()=>fixture(f=>{
 const run=()=>backup({...f,project:'nexus_prod_example'});run();const commands=f.calls.map(c=>c[1]);
 const index=x=>commands.findIndex(a=>a.includes(x));assert.ok(index('stop')>=0);assert.ok(index('stop')<index('pg_dump'));assert.ok(index('pg_dump')<index('start'));assert.ok(index('start')<index('--encrypt'));
 assert.ok(commands.some(a=>a[0]==='run'&&a.includes('type=volume,src=nexus_prod_example_keys,dst=/keys,readonly')));assert.ok(!commands.some(a=>a[0]==='exec'&&a.includes('tar')));
 for(const name of readdirSync(f.config.output))rmSync(join(f.config.output,name));
 assert.throws(()=>backup({...f,project:'nexus_prod_example',run:(e,a,o)=>{if(a.includes('start'))throw Error('secret');return f.run(e,a,o);}}),e=>e.code==='NEXUS_BACKUP_AVAILABILITY'&&!e.message.includes('secret'));assert.deepEqual(readdirSync(f.config.output),[]);
}));
test('review: repeated key tar size is bounded too',()=>fixture(f=>{
 let captures=0;assert.throws(()=>backup({...f,project:'nexus_prod_example',run:(e,a,o)=>{const r=f.run(e,a,o);return a.includes('tar')&&++captures===2?Buffer.concat([r,Buffer.alloc(16*1024*1024)]):r;}}));assert.deepEqual(readdirSync(f.config.output),[]);
}));
test('review: stopped inspection must contain every exact full ID once',()=>fixture(f=>{
 let stopped=false;assert.throws(()=>backup({...f,project:'nexus_prod_example',run:(e,a,o)=>{if(a.includes('stop'))stopped=true;const r=f.run(e,a,o);if(stopped&&a[0]==='inspect'){const all=JSON.parse(r);if(all[0].State.Status==='exited'){all[3]=all[1];return Buffer.from(JSON.stringify(all));}}return r;}}));assert.deepEqual(readdirSync(f.config.output),[]);
}));
test('review: unexpected plaintext/stage files refuse publication and are cleaned',()=>fixture(f=>{
 assert.throws(()=>backup({...f,project:'nexus_prod_example',run:(e,a,o)=>{const result=f.run(e,a,o);if(e===f.config.age)writeFileSync(join(f.config.output,readdirSync(f.config.output).find(n=>n.includes('.staging-')),'recovery.tar'),'synthetic plaintext');return result;}}));assert.deepEqual(readdirSync(f.config.output),[]);
}));
test('review: actual database network must be internal before quiescing; preflight refuses oversized databases',()=>{
 for(const mode of ['network','size'])fixture(f=>{let stopped=false;assert.throws(()=>backup({...f,project:'nexus_prod_example',run:(e,a,o)=>{if(a.includes('stop'))stopped=true;const r=f.run(e,a,o);if(mode==='network'&&a[0]==='network'){const n=JSON.parse(r);n[0].Internal=false;return Buffer.from(JSON.stringify(n));}if(mode==='size'&&a.at(-1).includes('pg_database_size'))return Buffer.from(String(192*1024*1024+1));return r;}}));assert.equal(stopped,false);assert.deepEqual(readdirSync(f.config.output),[]);});
});
test('review: capture failures always attempt exact Compose restart and refuse publication',()=>{
 for(const restartFails of [false,true])for(const step of ['stop','stopped-inspect','size','aggregate-before','pg_dump','pg_restore','keys-before','aggregate-after','keys-after'])fixture(f=>{
 let stop=false,restarted=false,aggregatesSeen=0,keysSeen=0,sizeSeen=0;
 assert.throws(()=>backup({...f,project:'nexus_prod_example',run:(e,a,o)=>{
  if(a.includes('stop'))stop=true;if(a.includes('start')){restarted=true;if(restartFails)throw Error('private-value');}
  let hit=a.includes(step);if(step==='stopped-inspect')hit=stop&&!restarted&&a[0]==='inspect';
  if(a.includes('psql')&&a.at(-1).includes('pg_database_size')){sizeSeen++;hit=step==='size'&&sizeSeen===2;}
  else if(a.includes('psql')){aggregatesSeen++;hit=step==='aggregate-before'&&aggregatesSeen===1||step==='aggregate-after'&&aggregatesSeen===2;}
  if(a.includes('tar')){keysSeen++;hit=step==='keys-before'&&keysSeen===1||step==='keys-after'&&keysSeen===2;}
  if(hit)throw Error('private-value');return f.run(e,a,o);
 }}),e=>!e.message.includes('private-value')&&(!restartFails||e.code==='NEXUS_BACKUP_AVAILABILITY'));assert.ok(stop,step);assert.ok(restarted,step);assert.deepEqual(readdirSync(f.config.output),[]);
 });
});
test('backup records immutable deployed image identities as well as release tags',()=>fixture(f=>{
 const n=backup({...f,project:'nexus_prod_example'}),m=verifyEnvelope(f.config.output,n.artifact,'nexus_prod_example',f.config.verificationKey,f.config.recipientFingerprint);
 assert.deepEqual(m.imageIds,{api:'sha256:'+'e'.repeat(64),frontend:'sha256:'+'e'.repeat(64),postgres:'sha256:'+'e'.repeat(64)});
}));
test('manifest-valid changed include still fails recorded content inventory',()=>fixture(f=>{
 const n=backup({...f,project:'nexus_prod_example',now:()=>new Date('2026-01-01T00:00:00Z')}),m=verifyEnvelope(f.config.output,n.artifact,'nexus_prod_example',f.config.verificationKey,f.config.recipientFingerprint);
 const files=unpackTar(readFileSync(join(f.config.output,n.artifact)));files['includes/production.env']=Buffer.from('changed');
 const manifest=JSON.parse(files['manifest.json']);manifest['includes/production.env']=hash(files['includes/production.env']);files['manifest.json']=Buffer.from(JSON.stringify(manifest));
 assert.throws(()=>validatePlaintext(packTar(files),m));
}));
test('restore rejects legacy config before decrypt and never invokes Docker',()=>fixture(f=>{
 const n=backup({...f,project:'nexus_prod_example',now:()=>new Date('2026-01-01T00:00:00Z')});
 const backupConfig=join(f.dir,'backup.json');writeFileSync(backupConfig,JSON.stringify(f.config));
 const identity=join(f.dir,'identity');writeFileSync(identity,'fake');const tempRoot=join(f.dir,'restore-temp');mkdirSync(tempRoot);
 const restoreConfig=join(f.dir,'restore.json');writeFileSync(restoreConfig,JSON.stringify({identity,tempRoot,sourceProject:'nexus_prod_example'}));
 const calls=[];const run=(exe,args)=>{calls.push([exe,args]);assert.equal(exe,f.config.age);writeFileSync(args[args.indexOf('--output')+1],readFileSync(args.at(-1)));};
 const options={project:'nexus_s10_restore_fixture',env:f.env,root:f.root,backupConfig,restoreConfig,artifact:join(f.config.output,n.artifact),run};
 assert.throws(()=>restoreVerify(options));assert.equal(calls.length,0);assert.deepEqual(readdirSync(tempRoot),[]);
 writeFileSync(options.artifact,'tampered');assert.throws(()=>restoreVerify(options));assert.equal(calls.length,0);
 assert.throws(()=>restoreVerify({...options,project:'nexus_prod_example'}));
 assert.throws(()=>restoreVerify({...options,restoreConfig:join(f.dir,'private-missing')}),e=>!e.message.includes(f.dir));
}));
test('aggregate before/after mismatch refuses before encryption and removes staging',()=>fixture(f=>{
 let snapshots=0,encrypted=false;
 assert.throws(()=>backup({...f,project:'nexus_prod_example',run:(e,a,o)=>{
  if(e===f.config.age)encrypted=true;
  if(a.includes('psql')&&!a.at(-1).includes('pg_database_size'))return Buffer.from(JSON.stringify({...aggregates,messages:aggregates.messages+(snapshots++===0?0:1)}));
  return f.run(e,a,o);
 }}));assert.equal(encrypted,false);assert.equal(snapshots,2);assert.deepEqual(readdirSync(f.config.output),[]);
}));
test('review: Memberships and InboxCursors mismatches abort backup and restart',()=>{
 for(const key of ['memberships','inboxCursors'])fixture(f=>{let reads=0,restarted=false,encrypted=false;assert.throws(()=>backup({...f,project:'nexus_prod_example',run:(e,a,o)=>{if(a.includes('start'))restarted=true;if(e===f.config.age)encrypted=true;if(a.includes('psql')&&a.at(-1).includes('json_build_object'))return Buffer.from(JSON.stringify({...aggregates,[key]:aggregates[key]+(reads++?1:0)}));return f.run(e,a,o);}}));assert.equal(reads,2);assert.ok(restarted);assert.equal(encrypted,false);assert.deepEqual(readdirSync(f.config.output),[]);});
});
test('review: signing key must not be reused as an archived certificate key',()=>fixture(f=>{
 writeFileSync(f.config.signingKey,certificateTestKey);writeFileSync(f.config.verificationKey,'-----BEGIN PUBLIC KEY-----\n'+Buffer.from('302a300506032b65700321003d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c','hex').toString('base64')+'\n-----END PUBLIC KEY-----\n');assert.throws(()=>backup({...f,project:'nexus_prod_example'}));assert.deepEqual(readdirSync(f.config.output),[]);
}));
test('review: invalid include snapshots refuse before quiescence or encryption',()=>{
 for(const include of includeNames)fixture(f=>{writeFileSync(f.config.includes.find(i=>i.name===include).source,'');let restarted=false,encrypted=false;assert.throws(()=>backup({...f,project:'nexus_prod_example',run:(e,a,o)=>{if(a.includes('start'))restarted=true;if(e===f.config.age)encrypted=true;return f.run(e,a,o);}}));assert.equal(restarted,false);assert.equal(encrypted,false);assert.ok(!f.calls.some(c=>c[1].includes('stop')));assert.deepEqual(readdirSync(f.config.output),[]);});
});
test('real restore wrapper returns success/removes stage, handled failure removes stage, cleanup failure retains exact private recovery files',()=>{
 for(const mode of ['success','failure','cleanup-container','cleanup-network','cleanup-volume'])fixture(f=>{
  const n=backup({...f,project:'nexus_prod_example',now:()=>new Date('2026-01-01T00:00:00Z')});
  const backupConfig=join(f.dir,'backup.json');writeFileSync(backupConfig,JSON.stringify(f.config));
  const identity=join(f.dir,'identity');writeFileSync(identity,'fake');const tempRoot=join(f.dir,'restore-temp');mkdirSync(tempRoot);
  const restoreConfig=join(f.dir,'restore.json');const config={identity,tempRoot,sourceProject:'nexus_prod_example',host:'localhost',bindIp:'127.0.0.1',port:49991,backendSubnet:'10.251.10.0/24',backendDynamicRange:'10.251.10.128/25',frontendIp:'10.251.10.2',edgeSubnet:'10.251.11.0/24',edgeDynamicRange:'10.251.11.128/25',edgeProxy:'10.251.11.2'};writeFileSync(restoreConfig,JSON.stringify(config));
  let adapter;
  const run=(exe,args,options)=>{
   if(exe===f.config.age){assert.ok(!args.includes('--output'),'decrypted archive must remain in memory');assert.equal(args[args.indexOf('--identity')+1],'-');assert.ok(!args.includes(identity));assert.ok(!args.includes(join(f.config.output,n.artifact)));const authenticated=readFileSync(join(f.config.output,n.artifact));assert.deepEqual(readFileSync(args.at(-1)),authenticated);writeFileSync(join(f.config.output,n.artifact),'replacement after authentication');assert.deepEqual(options.input,Buffer.from('fake'));return authenticated;}
   adapter??=fakeRestore({root:f.root,stage:join(tempRoot,readdirSync(tempRoot)[0]),config,mutate:(r,c)=>{
    if(mode==='failure'&&c.args.includes('pg_restore'))throw Error('private-path external-stderr');
    if(mode.startsWith('cleanup-')&&c.down&&c.args[0]===mode.slice(8)&&c.args[1]==='ls')return 'leftover';return r;
   }});
   return adapter.run(exe,args,options);
  };
  const options={project:'nexus_s10_restore_fixture',root:f.root,backupConfig,restoreConfig,artifact:join(f.config.output,n.artifact),run};
  if(mode==='success')assert.equal(restoreVerify(options),undefined);
  else assert.throws(()=>restoreVerify(options),e=>mode.startsWith('cleanup-')?e.code==='NEXUS_RESTORE_CLEANUP'&&!e.message.includes(f.dir):!e.message.includes('external-stderr'));
  if(mode.startsWith('cleanup-')){const stages=readdirSync(tempRoot);assert.equal(stages.length,1);for(const name of ['production.env','database-password'])assert.ok(readFileSync(join(tempRoot,stages[0],name)).length);}
  else assert.deepEqual(readdirSync(tempRoot),[]);
  assert.ok(adapter.calls.some(c=>c.args.includes('down')));
  assert.ok(adapter.calls.every(c=>!c.args.includes('nexus_prod_example')));
 });
});
test('wrong project/services/health/release and unsafe key tar refuse before encryption',()=>{
 for(const mode of ['project','duplicate','extra','unhealthy','migration','release','dump','keys','migrate-image','missing-migrate','short-id','wrong-volume','secret-rw','extra-bind','user','command','entrypoint','network','capability','hostport','readonly','privileged','security'])fixture(f=>{
  let encrypted=false;
  assert.throws(()=>backup({...f,project:'nexus_prod_example',run:(exe,args,opts)=>{
   if(exe===f.config.age)encrypted=true;
   const result=f.run(exe,args,opts);
   if(args[0]==='inspect'){
    const c=JSON.parse(result);
    if(mode==='project')c[0].Config.Labels['com.docker.compose.project']='nexus_prod_other';
    if(mode==='duplicate')c.push(c[0]);if(mode==='extra')c[0].Config.Labels['com.docker.compose.service']='unexpected';
    if(mode==='unhealthy')c[0].State.Health.Status='unhealthy';if(mode==='migration')c.at(-1).State.ExitCode=1;
    if(mode==='release')c[0].Config.Labels['org.opencontainers.image.revision']='b'.repeat(40);
    if(mode==='migrate-image')c.at(-1).Image='sha256:'+'f'.repeat(64);if(mode==='missing-migrate')c.pop();if(mode==='short-id')c[0].Id=c[0].Id.slice(0,12);
    if(mode==='wrong-volume')c[0].Mounts[1].Name='another_keys';if(mode==='secret-rw')c[0].Mounts[0].RW=true;if(mode==='extra-bind')c[0].Mounts.push({Type:'bind',Source:'/unexpected',Destination:'/unexpected',RW:true});
    if(mode==='user')c[0].Config.User='root';if(mode==='command')c[0].Config.Cmd=['unexpected'];if(mode==='entrypoint')c[0].Config.Entrypoint=['sh'];if(mode==='network')c[0].NetworkSettings.Networks.extra={};if(mode==='capability')c[0].HostConfig.CapAdd=['SYS_ADMIN'];if(mode==='hostport')c[0].HostConfig.PortBindings={'8080/tcp':[{HostIp:'0.0.0.0',HostPort:'8080'}]};if(mode==='readonly')c[0].HostConfig.ReadonlyRootfs=false;if(mode==='privileged')c[0].HostConfig.Privileged=true;if(mode==='security')c[0].HostConfig.SecurityOpt=[];
    return Buffer.from(JSON.stringify(c));
   }
   if(mode==='dump'&&args.includes('pg_dump'))return Buffer.from('invalid');
   if(mode==='keys'&&args.includes('tar'))return packTar({'../key.xml':Buffer.from('fake')});
   return result;
  }}));assert.equal(encrypted,false);assert.deepEqual(readdirSync(f.config.output),[]);
 });
});
test('round6: collision and publication failure never overwrite existing material and preserve published evidence',()=>fixture(f=>{
 const options={...f,project:'nexus_prod_example',now:()=>new Date('2026-01-01T00:00:00Z')};
 const n=backup(options),original=readFileSync(join(f.config.output,n.artifact));assert.throws(()=>backup(options));assert.ok(original.equals(readFileSync(join(f.config.output,n.artifact))));
 for(const name of Object.values(n))rmSync(join(f.config.output,name));
 assert.throws(()=>backup({...options,run:(exe,args,o)=>{const out=f.run(exe,args,o);if(exe===f.config.age)writeFileSync(join(f.config.output,n.metadata),'do-not-overwrite');return out;}}));
 assert.deepEqual(readdirSync(f.config.output).sort(),[n.artifact,n.sidecar,n.metadata].sort());assert.equal(readFileSync(join(f.config.output,n.metadata),'utf8'),'do-not-overwrite');
}));
test('each command failure removes only exact-run staging/partials and retains previous artifact; key changes fail closed',()=>{
 for(let failAt=0;failAt<9;failAt++)fixture(f=>{
  writeFileSync(join(f.config.output,'previous'),'keep');let calls=0;
  assert.throws(()=>backup({...f,project:'nexus_prod_example',run:(...a)=>{if(calls++===failAt)throw Error('private-path-secret');return f.run(...a);},now:()=>new Date('2026-01-01T00:00:00Z')}),e=>!e.message.includes('private-path-secret'));
  assert.deepEqual(readdirSync(f.config.output),['previous']);
 });
 fixture(f=>{let captures=0;assert.throws(()=>backup({...f,project:'nexus_prod_example',run:(e,a,o)=>a.includes('tar')&&++captures===2?packTar({'key-5678.xml':Buffer.from('changed')}):f.run(e,a,o)}));assert.deepEqual(readdirSync(f.config.output),[]);});
});
