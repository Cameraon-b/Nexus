import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {homedir} from 'node:os';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {operationCandidate,removeFixture as rmSync} from './fixtures/operation-candidate.mjs';
import {acceptanceEnvironment} from './production-acceptance-config.mjs';
import {spawnNode} from './fixtures/spawn-node.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const death of [false,true])test('native Linux candidate replacement refuses before fake Docker; unreachable death hook='+death,{skip:process.platform!=='linux'},async()=>{
 const base=mkdtempSync(join(homedir(),'.nexus-consumption-')),custody=join(base,'custody');mkdirSync(custody,{mode:0o700});
 try{
  const {root,cli}=operationCandidate(custody),config=join(custody,'config/production.env');mkdirSync(dirname(config));const originalEnv=acceptanceEnvironment({commit:'a'.repeat(40),dir:base,octet:100,frontendPort:49991})+'\nNEXUS_PROOF=original\n';writeFileSync(config,originalEnv,{mode:0o600});
  const paths=['deployment/compose.production.yaml','scripts/production.mjs','scripts/posix-operation-lock.py','scripts/windows-operation-lock.ps1'];
  const before=paths.map(p=>hash(readFileSync(join(root,p))));
  const bin=join(base,'bin'),record=join(base,'record'),pinned=join(base,'pinned');mkdirSync(bin);
  // This is deliberately NOT real Docker. It records bytes consumed through
  // real cwd/argv file opens in an independently executed Linux process.
  writeFileSync(join(bin,'docker'),`#!/usr/bin/python3\nimport os,sys,json,signal\na=sys.argv[1:]\nenv=a[a.index('--env-file')+1]\ncompose=a[a.index('-f')+1]\nr={'env':open(env,'rb').read().decode('utf8'),'compose':open(compose,'rb').read().decode('utf8'),'cwd':os.getcwd(),'args':a}\nwith open(os.environ['DISPOSABLE_DOCKER_RECORD'],'a') as f:f.write(json.dumps(r)+'\\n')\nif os.environ['DISPOSABLE_DOCKER_DEATH']=='1':os.kill(int(env.split('/')[2]),signal.SIGKILL)\nprint(json.dumps({'services':{'api':{'image':'nexus-api:'+'a'*40}}}))\n`,{mode:0o700});
  const child=spawnNode(['--import',new URL('./fixtures/pinned-consumption-preload.mjs',import.meta.url).href,cli,'stop','--project','nexus_s8_disposable_pinned_'+hash(base),'--config-file',config],{env:{...process.env,PATH:bin+':'+process.env.PATH,NEXUS_DISPOSABLE_RACE:JSON.stringify({custody,config,root}),NEXUS_DISPOSABLE_PINNED:pinned,DISPOSABLE_DOCKER_RECORD:record,DISPOSABLE_DOCKER_DEATH:death?'1':'0'},stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',b=>stderr+=b);child.stdout.resume();const [status]=await once(child,'exit');
  assert.equal(status,1,'renamed custody cleanup must refuse');assert.match(stderr,/cleanup|lock/i);
  // Round 14 authenticates the named candidate for its full lifetime: the
  // custody rename now refuses before consumption, rather than using stale names.
  assert.equal(existsSync(record),false);
  const held=root.replace(custody,custody+'-held');assert.deepEqual(paths.map(p=>hash(readFileSync(join(held,p)))),before);
  const inputs=JSON.parse(readFileSync(pinned));assert.equal(existsSync(inputs.config),false);assert.equal(existsSync(inputs.candidate),false);
 }finally{rmSync(base,{recursive:true,force:true,maxRetries:20,retryDelay:50});}
});
