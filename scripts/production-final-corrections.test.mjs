import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {packTar,keyFingerprint} from './production-recovery.mjs';
import {keyName,keyXml} from './fixtures/data-protection.mjs';
import {signEnvelope,authenticateEnvelope} from './production-signing.mjs';
import {testPrivateKey,testPublicKey} from './fixtures/signing.mjs';
test('final: restore secret exact mode and closed read-only Compose mount contract',()=>{
 const source=readFileSync(new URL('./production-restore.mjs',import.meta.url),'utf8');
 assert.ok(source.includes("writeFileSync(secret,files['includes/database-password'],{mode:0o444,flag:'wx'})"));
 const compose=JSON.parse(readFileSync(new URL('./fixtures/restore-compose.json',import.meta.url)));
 for(const service of ['api','migrate','postgres'])assert.deepEqual(compose.services[service].secrets,[{source:'database_password',target:'/run/secrets/database_password'}]);
 assert.ok(source.includes("eq(s.secrets,[{source:'database_password',target:'/run/secrets/database_password'}])"));
});
test('final: valid key content with public archived mode is refused',()=>{
 const tar=packTar({[keyName]:Buffer.from(keyXml)});tar.write('0000777\0',100,8,'ascii');tar.fill(32,148,156);const sum=tar.subarray(0,512).reduce((a,b)=>a+b,0);tar.write(sum.toString(8).padStart(6,'0')+'\0 ',148,8,'ascii');
 assert.throws(()=>keyFingerprint(tar));
});
test('final: noncanonical signature padding bits are refused',()=>{
 const m={project:'nexus_prod_example',created:'2026-01-01T00:00:00Z',version:2},cipher=Buffer.from('cipher'),meta=Buffer.from('{}');
 const a=JSON.parse(signEnvelope('artifact',m,cipher,meta,testPrivateKey));
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';const s=a.signature;
 a.signature=s.slice(0,85)+alphabet[alphabet.indexOf(s[85])+1]+'==';
 assert.deepEqual(Buffer.from(a.signature,'base64'),Buffer.from(s,'base64'));
 assert.throws(()=>authenticateEnvelope('artifact',m,cipher,meta,JSON.stringify(a),testPublicKey));
});
