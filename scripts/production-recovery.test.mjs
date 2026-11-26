import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,mkdirSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {externalPath,loadBackupConfig,packTar,unpackTar,validatePlaintext,hash} from './production-recovery.mjs';

import {testPrivateKey,testPublicKey} from './fixtures/signing.mjs';
function keyPaths(dir){const signingKey=join(dir,'signing.pem'),verificationKey=join(dir,'verification.pem');writeFileSync(signingKey,testPrivateKey);writeFileSync(verificationKey,testPublicKey);return {signingKey,verificationKey};}
export function fixture(fn){const dir=mkdtempSync(join(tmpdir(),'nexus_s10_'));try{return fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}}
test('canonical regular paths reject repository aliases and non-files',()=>fixture(dir=>{
 const repo=join(dir,'repo');mkdirSync(repo);writeFileSync(join(repo,'private'),'dummy');
 symlinkSync(repo,join(dir,'alias'),'junction');
 assert.throws(()=>externalPath(join(dir,'alias','private'),repo));
 assert.throws(()=>externalPath(repo,repo));assert.throws(()=>externalPath('relative',repo));
 writeFileSync(join(dir,'ok'),'dummy');assert.equal(externalPath(join(dir,'ok'),repo),resolve(dir,'ok'));
}));
test('bounded JSON config requires all logical includes, rejects duplicates, unknown keys and identity',()=>fixture(dir=>{
 const repo=join(dir,'repo');mkdirSync(repo); const file=join(dir,'source');writeFileSync(file,'dummy');
 const c={...keyPaths(dir),output:dir,recipient:file,recipientFingerprint:hash('dummy'),age:file,includes:['production.env','database-password','certificate.pem','certificate-key.pem','npm-current.json','npm-rollback.json'].map(name=>({name,source:file}))};
 const path=join(dir,'config');const load=()=>{writeFileSync(path,JSON.stringify(c));return loadBackupConfig(path,repo);};
 assert.equal(load().includes.length,6);
 for(const pin of [undefined,null,123,'REPLACE_ME','A'.repeat(64),'a'.repeat(63),'a'.repeat(65),'a'.repeat(64)+'\n']){c.recipientFingerprint=pin;assert.throws(load);assert.throws(()=>loadBackupConfig(path,repo,{transportOnly:true}));}c.recipientFingerprint=hash('dummy');
 assert.equal(load().recipientFingerprint,hash('dummy'));c.includes.push(c.includes[0]);assert.throws(load);c.includes.pop();
 c.includes[0].name='../escape';assert.throws(load);c.includes[0].name='production.env';c.identity=file;assert.throws(load);
}));
test('transport verification does not require original include sources or encryption executable/recipient',()=>fixture(dir=>{
 const repo=join(dir,'repo');mkdirSync(repo);const missing=join(dir,'unavailable');
 const c={...keyPaths(dir),output:dir,recipient:missing,recipientFingerprint:hash('dummy'),age:missing,includes:['production.env','database-password','certificate.pem','certificate-key.pem','npm-current.json','npm-rollback.json'].map(name=>({name,source:missing}))};
 const path=join(dir,'config');writeFileSync(path,JSON.stringify(c));
 rmSync(c.signingKey);assert.equal(loadBackupConfig(path,repo,{transportOnly:true}).output,dir);assert.throws(()=>loadBackupConfig(path,repo));
 rmSync(c.verificationKey);assert.throws(()=>loadBackupConfig(path,repo,{transportOnly:true}));
}));
test('review: malformed/empty/non-Ed25519/mismatched producer keys refuse; transport pins public key',()=>fixture(dir=>{
 const repo=join(dir,'repo');mkdirSync(repo);const source=join(dir,'source');writeFileSync(source,'synthetic');const keys=keyPaths(dir);
 const c={...keys,output:dir,recipient:source,recipientFingerprint:hash('synthetic'),age:source,includes:['production.env','database-password','certificate.pem','certificate-key.pem','npm-current.json','npm-rollback.json'].map(name=>({name,source}))};const path=join(dir,'config');writeFileSync(path,JSON.stringify(c));
 const load=()=>loadBackupConfig(path,repo);assert.ok(load());
 for(const field of ['signingKey','verificationKey']){const original=field==='signingKey'?testPrivateKey:testPublicKey;for(const bad of ['', 'garbage',field==='signingKey'?testPublicKey:testPrivateKey]){writeFileSync(keys[field],bad);assert.throws(load);}writeFileSync(keys[field],original);}
 const other='-----BEGIN PUBLIC KEY-----\n'+Buffer.from('302a300506032b65700321003d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c','hex').toString('base64')+'\n-----END PUBLIC KEY-----\n';writeFileSync(keys.verificationKey,other);assert.throws(load);
 const ec='-----BEGIN PUBLIC KEY-----\n'+Buffer.from('3059301306072a8648ce3d020106082a8648ce3d030107034200046b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c2964fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5','hex').toString('base64')+'\n-----END PUBLIC KEY-----\n';writeFileSync(keys.verificationKey,ec);assert.throws(()=>loadBackupConfig(path,repo,{transportOnly:true}));
 writeFileSync(keys.verificationKey,testPublicKey);const alias=join(dir,'key-alias');symlinkSync(dir,alias,'junction');c.verificationKey=join(alias,'verification.pem');writeFileSync(path,JSON.stringify(c));assert.throws(load);
}));
test('strict tar reader rejects traversal, links, devices, duplicates, missing, extra and manifest tamper',()=>{
 const entries={'database.dump':Buffer.from('PGDMPfake'),'keys.tar':packTar({'key.xml':Buffer.from('dummy')}),'metadata.json':Buffer.from('{}')};
 const tar=packTar(entries);assert.deepEqual(Object.keys(unpackTar(tar)),Object.keys(entries));
 for(const name of ['../bad','/bad','a/../bad'])assert.throws(()=>unpackTar(packTar({[name]:Buffer.from('x')})));
 for(const type of ['1','2','3','4','6','x']){const b=Buffer.from(tar);b[156]=type.charCodeAt(0);b.fill(32,148,156);const sum=b.subarray(0,512).reduce((a,v)=>a+v,0);b.write(sum.toString(8).padStart(6,'0')+'\0 ',148,8,'ascii');assert.throws(()=>unpackTar(b));}
 const duplicate=Buffer.concat([tar.subarray(0,tar.length-1024),tar]);assert.throws(()=>unpackTar(duplicate));
 assert.throws(()=>validatePlaintext(tar,{}));
 const manifest=Object.fromEntries(Object.entries(entries).map(([k,v])=>[k,hash(v)]));
 assert.throws(()=>validatePlaintext(packTar({...entries,'manifest.json':Buffer.from(JSON.stringify(manifest)),extra:Buffer.from('x')}),{}));
});
