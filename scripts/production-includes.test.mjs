import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateIncludes} from './production-includes.mjs';
import {recoveryIncludes} from './fixtures/recovery-includes.mjs';
import {testPublicKey,testPrivateKey} from './fixtures/signing.mjs';
const files=()=>Object.fromEntries(Object.entries(recoveryIncludes).map(([n,v])=>['includes/'+n,Buffer.from(v)]));
test('review: all includes nonempty, password trimmed-nonempty, env UTF8, cert/key match, NPM nonempty objects',()=>{
 validateIncludes(files());
 for(const name of Object.keys(recoveryIncludes))for(const bad of ['', ' ', '\0']){const f=files();f['includes/'+name]=Buffer.from(bad);assert.throws(()=>validateIncludes(f),e=>!e.message.includes('BEGIN'));}
 for(const name of ['npm-current.json','npm-rollback.json'])for(const bad of ['{','[]','{}','null','true','"value"']){const f=files();f['includes/'+name]=Buffer.from(bad);assert.throws(()=>validateIncludes(f));}
 for(const [name,bad] of [['certificate.pem','-----BEGIN CERTIFICATE-----\ntruncated'],['certificate-key.pem','garbage'],['certificate-key.pem',testPublicKey]]){const f=files();f['includes/'+name]=Buffer.from(bad);assert.throws(()=>validateIncludes(f));}
 const mismatch=files();mismatch['includes/certificate-key.pem']=Buffer.from(testPrivateKey);assert.throws(()=>validateIncludes(mismatch));
 const f=files();f['includes/production.env']=Buffer.from([255]);assert.throws(()=>validateIncludes(f));
});
