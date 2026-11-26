// Inert certificate-shaped ASN.1 fixture: PUBLIC RFC 8032 test public key,
// deliberately invalid all-zero certificate signature. NOT a usable certificate.
// No operational keys, certificates or real data are generated or read.
// Independent RFC 8032 section 7.1 vector #2 (also publicly compromised).
export const certificateTestKey='-----BEGIN PRIVATE KEY-----\n'+Buffer.from('302e020100300506032b6570042204204ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb','hex').toString('base64')+'\n-----END PRIVATE KEY-----\n';
const der=(tag,...parts)=>{const body=Buffer.concat(parts.map(p=>Buffer.from(p)));const size=body.length<128?Buffer.from([body.length]):body.length<256?Buffer.from([0x81,body.length]):Buffer.from([0x82,body.length>>8,body.length&255]);return Buffer.concat([Buffer.from([tag]),size,body]);};
const seq=(...parts)=>der(0x30,...parts),oid=hex=>der(6,Buffer.from(hex,'hex')),alg=seq(oid('2b6570'));
const name=seq(der(0x31,seq(oid('550403'),der(12,Buffer.from('PUBLIC NONFUNCTIONAL TEST FIXTURE')))));
const spki=Buffer.from('302a300506032b65700321003d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c','hex');
const tbs=seq(der(0xa0,der(2,[2])),der(2,[1]),alg,name,seq(der(23,Buffer.from('260101000000Z')),der(23,Buffer.from('260401000000Z'))),name,spki);
const cert=seq(tbs,alg,der(3,Buffer.alloc(65))).toString('base64').match(/.{1,64}/g).join('\n');
export const testCertificate='-----BEGIN CERTIFICATE-----\n'+cert+'\n-----END CERTIFICATE-----\n';
export const recoveryIncludes={'production.env':'NEXUS_TEST=synthetic\n','database-password':'public-test-password','certificate.pem':testCertificate,'certificate-key.pem':certificateTestKey,'npm-current.json':'{"synthetic":true}','npm-rollback.json':'{"synthetic":true}'};
