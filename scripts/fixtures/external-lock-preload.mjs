// Subprocess-only synthetic decrypt boundary; no age, Docker or private access.
import {registerHooks} from 'node:module';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {dirname,join} from 'node:path';
import assert from 'node:assert/strict';
globalThis.round9Decrypt=()=>{
 const locks=join(dirname(process.env.NEXUS_TEST_CONFIG),'.nexus-production-locks');
 assert.equal(readdirSync(locks).filter(n=>n.endsWith('.lock')).length,1);
 assert.equal(existsSync(join(process.env.NEXUS_TEST_CANDIDATE,'.local')),false);
 console.log('INJECTED_AGE_DECRYPT_BOUNDARY');
 if(process.env.NEXUS_TEST_FAIL)throw Error('synthetic decrypt refusal');
 return Buffer.from('synthetic plaintext');
};
registerHooks({load(url,context,next){
 if(url.endsWith('/production-backup.mjs')){
  const source=readFileSync(new URL(url),'utf8').replace('export function execute(executable,args,options={},spawn=spawnSync){','export function execute(executable,args,options={},spawn=spawnSync){return globalThis.round9Decrypt();');
  return {format:'module',shortCircuit:true,source};
 }
 if(url.endsWith('/production-envelope.mjs'))return {format:'module',shortCircuit:true,source:`export const verifyEnvelopeBytes=()=>({metadata:{},ciphertext:Buffer.from('synthetic ciphertext')}); export const verifyEnvelope=()=>{}; export const artifactNames=()=>{}; export const validateMetadata=()=>{}; export const signEnvelope=()=>{}; import {readFileSync} from 'node:fs'; export const readBoundedFile=p=>readFileSync(p); export const maxCiphertextBytes=1024;`};
 if(url.endsWith('/production-recovery.mjs')){
  return {format:'module',shortCircuit:true,source:readFileSync(new URL(url),'utf8').replace('export function validatePlaintext(tar,metadata){','export function validatePlaintext(tar,metadata){return {}; }\nfunction unusedValidatePlaintext(tar,metadata){')};
 }
 if(url.endsWith('/production-restore.mjs'))return {format:'module',shortCircuit:true,source:'export const validateRestoreConfig=c=>c; export const restoreStack=()=>{}; export const auditRestoreCompose=()=>{};'};
 return next(url,context);
}});
