import {test} from 'node:test';
import assert from 'node:assert/strict';
import {aggregateTables,validateAggregates,sameAggregates,aggregateSql} from './production-aggregates.mjs';
import {aggregates} from './fixtures/recovery.mjs';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {testPrivateKey,testPublicKey} from './fixtures/signing.mjs';
import * as envelope from './production-envelope.mjs';
import {metadata} from './production-envelope.test.mjs';
import {hash,packTar,keyFingerprint} from './production-recovery.mjs';
import {keyXml,keyName} from './fixtures/data-protection.mjs';
test('review: all eleven durable EF sets are mandatory and new counts participate in comparison',()=>{
 assert.equal(aggregateTables.memberships,'Memberships');assert.equal(aggregateTables.inboxCursors,'InboxCursors');
 assert.equal(Object.keys(aggregateTables).length,11);assert.equal(aggregateSql.split(';').length,2);
 for(const key of ['memberships','inboxCursors']){const missing={...aggregates};delete missing[key];assert.throws(()=>validateAggregates(missing));assert.equal(sameAggregates(aggregates,{...aggregates,[key]:aggregates[key]+1}),false);}
});
test('review: Data Protection XML must be structurally recoverable, bounded and match its GUID',()=>{
 const fingerprint=(text,name=keyName)=>keyFingerprint(packTar({[name]:Buffer.from(text)}));assert.match(fingerprint(keyXml),/^[a-f0-9]{64}$/);
 for(const text of ['', 'garbage', '<key/>',keyXml+'garbage','<!DOCTYPE key>'+keyXml,keyXml.replace('version="1"','version="2"'),keyXml.replace('2026-04-01','2025-04-01'),keyXml.replace('2026-04-01','2026-02-30'),keyXml.replace('AES_256_CBC','other'),keyXml.replace('<value>','<broken>'),keyXml.replace(/<value>[^<]+/, '<value>bad'),keyXml.replace('01234567-89ab','11234567-89ab'),keyXml.replace('<creationDate>','<creationDate extra="x">'),keyXml+' '.repeat(65536)])assert.throws(()=>fingerprint(text));
 assert.throws(()=>fingerprint(keyXml,'key-1234.xml'));assert.throws(()=>keyFingerprint(packTar({[keyName]:Buffer.from([0xff])})));
});
test('review: detached provenance required; metadata/ciphertext/sidecar/signature/name/key substitutions refuse',()=>{
 const dir=mkdtempSync(join(tmpdir(),'nexus_review_'));try{
 const m=metadata(),n=envelope.artifactNames(m.created),key=join(dir,'public.pem');writeFileSync(key,testPublicKey);
 assert.ok(n.signature);const cipher=Buffer.from('encrypted'),meta=Buffer.from(JSON.stringify(m)+'\n');
 writeFileSync(join(dir,n.artifact),cipher);writeFileSync(join(dir,n.metadata),meta);writeFileSync(join(dir,n.sidecar),hash(cipher)+'  '+n.artifact+'\n');
 const verify=()=>envelope.verifyEnvelope(dir,n.artifact,m.project,key,'a'.repeat(64));
 assert.throws(verify);const signed=envelope.signEnvelope(n.artifact,m,cipher,meta,testPrivateKey);writeFileSync(join(dir,n.signature),signed);assert.equal(verify().project,m.project);
 for(const name of Object.values(n)){const original=readFileSync(join(dir,name));writeFileSync(join(dir,name),Buffer.concat([original,Buffer.from('x')]));assert.throws(verify);writeFileSync(join(dir,name),original);}
 for(const change of [{project:'nexus_prod_other'},{created:'2026-01-02T00:00:00Z'},{commit:'b'.repeat(40)}]){writeFileSync(join(dir,n.metadata),JSON.stringify({...m,...change}));assert.throws(verify);}writeFileSync(join(dir,n.metadata),meta);
 const otherPublic='-----BEGIN PUBLIC KEY-----\n'+Buffer.from('302a300506032b65700321003d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c','hex').toString('base64')+'\n-----END PUBLIC KEY-----\n';
 for(const bad of ['', 'garbage',testPrivateKey,otherPublic]){writeFileSync(key,bad);assert.throws(verify);}writeFileSync(key,testPublicKey);
 assert.throws(()=>envelope.signEnvelope(n.artifact,m,cipher,meta,'garbage'));
 const renamed=envelope.artifactNames('2026-01-02T00:00:00Z');for(const field of ['artifact','metadata','signature'])writeFileSync(join(dir,renamed[field]),readFileSync(join(dir,n[field])));writeFileSync(join(dir,renamed.sidecar),hash(cipher)+'  '+renamed.artifact+'\n');assert.throws(()=>envelope.verifyEnvelope(dir,renamed.artifact,m.project,key));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
