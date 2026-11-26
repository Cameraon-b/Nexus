import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,renameSync,chmodSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {generateKeyPairSync} from 'node:crypto';
import {loadBackupConfig} from './production-recovery.mjs';
import {snapshotInput,recheckInput} from './production-input-snapshot.mjs';
import {privateCustody} from './fixtures/operation-candidate.mjs';
for(const kind of ['backup-config','verification-key','age-identity'])for(const mutation of ['replacement','in-place'])test('round14 exact '+kind+' snapshot survives '+mutation+' and detects source drift',()=>{
 const d=mkdtempSync(join(resolve('artifacts'),'nexus-r14-input-'));privateCustody(d);
 try{
  const root=join(d,'candidate');mkdirSync(root);const path=join(d,kind),bytes=Buffer.from('reviewed exact bytes');writeFileSync(path,bytes,{mode:0o600});
  const held=snapshotInput(path,root);
  if(mutation==='replacement')renameSync(path,path+'.old');
  writeFileSync(path,'substituted bytes',{mode:0o600});
  assert.deepEqual(held.bytes,bytes);assert.throws(()=>recheckInput(held,root));
 }finally{rmSync(d,{recursive:true,force:true});}
});
test('round14 private input refuses foreign read aliases',()=>{
 const d=mkdtempSync(join(resolve('artifacts'),'nexus-r14-input-'));privateCustody(d);
 try{
  const root=join(d,'candidate');mkdirSync(root);const path=join(d,'identity');writeFileSync(path,'private snapshot',{mode:0o600});
  if(process.platform==='win32'){const grant=spawnSync('icacls.exe',[path,'/grant','*S-1-1-0:R'],{encoding:'utf8'});assert.equal(grant.status,0);}
  else chmodSync(path,0o644);
  assert.throws(()=>snapshotInput(path,root));
 }finally{rmSync(d,{recursive:true,force:true});}
});
const pair=generateKeyPairSync('ed25519'),publicKey=pair.publicKey.export({type:'spki',format:'pem'}),privateKey=pair.privateKey.export({type:'pkcs8',format:'pem'});
test('round14 backup config refuses oversized JSON before parsing',()=>{
 const d=mkdtempSync(join(resolve('artifacts'),'nexus-r14-input-'));
 try{
  const root=join(d,'candidate');mkdirSync(root);const output=join(d,'output');mkdirSync(output);
  const key=join(d,'verify'),sign=join(d,'sign');writeFileSync(key,publicKey,{mode:0o600});writeFileSync(sign,privateKey,{mode:0o600});
  const config={output,verificationKey:key,signingKey:sign,recipient:join(d,'recipient'),recipientFingerprint:'a'.repeat(64),age:join(d,'age'),includes:['production.env','database-password','certificate.pem','certificate-key.pem','npm-current.json','npm-rollback.json'].map(name=>({name,source:join(d,name)}))};
  const path=join(d,'backup.json');writeFileSync(path,JSON.stringify(config)+' '.repeat(1024*1024),{mode:0o600});
  assert.throws(()=>loadBackupConfig(path,root,{transportOnly:true}));
 }finally{rmSync(d,{recursive:true,force:true});}
});
