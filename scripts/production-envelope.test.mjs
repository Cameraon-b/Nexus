import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hash} from './production-recovery.mjs';
import {verifyEnvelope,artifactNames,validateMetadata} from './production-envelope.mjs';
import {aggregates} from './fixtures/recovery.mjs';
import {testPrivateKey,testPublicKey} from './fixtures/signing.mjs';
import {signEnvelope} from './production-signing.mjs';
export const metadata=(created='2026-01-01T00:00:00Z')=>({version:2,recipientFingerprint:'a'.repeat(64),aggregates,created,project:'nexus_prod_example',commit:'a'.repeat(40),imageIds:Object.fromEntries(['api','frontend','postgres'].map(s=>[s,'sha256:'+'e'.repeat(64)])),images:{api:'nexus-api:'+ 'a'.repeat(40),frontend:'nexus-frontend:'+ 'a'.repeat(40),postgres:'postgres:18@sha256:979bccfde35445db618c65107d27d08c6c21339d8dc3ad4c830c6633947be0e4'},services:['api','frontend','migrate','postgres'],migrationCount:3,keyFingerprint:'c'.repeat(64),inventory:Object.fromEntries(['database.dump','keys.tar','includes/production.env','includes/database-password','includes/certificate.pem','includes/certificate-key.pem','includes/npm-current.json','includes/npm-rollback.json'].map(k=>[k,'d'.repeat(64)]))});
test('round3: signed recipient claim requires independent exact pin (producer/verify/restore/pull envelope gate)',()=>{
 const dir=mkdtempSync(join(tmpdir(),'nexus_s10_pin_'));
 try { const m=metadata(),n=quartet(dir,m);
 const verify=pin=>verifyEnvelope(dir,n.artifact,m.project,join(dir,'public.pem'),pin);
 assert.throws(()=>verify('b'.repeat(64)));
 for(const pin of [undefined,'REPLACE_ME','A'.repeat(64),'a'.repeat(63)])assert.throws(()=>verify(pin));
 assert.equal(verify('a'.repeat(64)).recipientFingerprint,'a'.repeat(64));
 const substituted={...m,recipientFingerprint:'b'.repeat(64)};quartet(dir,substituted);assert.throws(()=>verify('a'.repeat(64)));assert.equal(verify('b'.repeat(64)).recipientFingerprint,'b'.repeat(64));
 for(const value of [undefined,null,123,'REPLACE_ME','A'.repeat(64),'a'.repeat(63)]){quartet(dir,{...m,recipientFingerprint:value});assert.throws(()=>verify('a'.repeat(64)));}
 quartet(dir,m);writeFileSync(join(dir,n.metadata),JSON.stringify(substituted));assert.throws(()=>verify('b'.repeat(64)));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
export function quartet(dir,m=metadata()) {const n=artifactNames(m.created);writeFileSync(join(dir,n.artifact),'encrypted');writeFileSync(join(dir,n.sidecar),hash('encrypted')+'  '+n.artifact+'\n');const meta=JSON.stringify(m);writeFileSync(join(dir,n.metadata),meta);writeFileSync(join(dir,n.signature),signEnvelope(n.artifact,m,Buffer.from('encrypted'),Buffer.from(meta),testPrivateKey));writeFileSync(join(dir,'public.pem'),testPublicKey);return n;}
test('exact envelope verifies transport and refuses tamper, partial siblings, malformed schema/project/date',()=>{
 const dir=mkdtempSync(join(tmpdir(),'nexus_s10_envelope_'));
 try{const n=quartet(dir);const verify=()=>verifyEnvelope(dir,n.artifact,'nexus_prod_example',join(dir,'public.pem'),'a'.repeat(64));assert.equal(verify().project,'nexus_prod_example');
 writeFileSync(join(dir,n.artifact+'.partial'),'x');assert.throws(verify);rmSync(join(dir,n.artifact+'.partial'));
 writeFileSync(join(dir,n.artifact),'tamper');assert.throws(verify);assert.throws(()=>verifyEnvelope(dir,'../'+n.artifact,'nexus_prod_example'));
 for(const change of [{version:1},{aggregates:undefined},{aggregates:{...aggregates,extra:0}},{aggregates:{...aggregates,accounts:-1}},{migrationCount:4},{project:'nexus_prod_wrong'},{commit:'secret'},{created:'2026-02-30T00:00:00Z'},{extra:'private path'}])assert.throws(()=>validateMetadata({...metadata(),...change},'nexus_prod_example'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
