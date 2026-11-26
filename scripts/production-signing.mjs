import {createPrivateKey,createPublicKey,sign,verify,timingSafeEqual} from 'node:crypto';
import {fail,hash,exactKeys} from './production-recovery.mjs';
export function signingKey(bytes,privateKey=false){
 try{
  const text=Buffer.from(bytes).toString('utf8'),label=privateKey?'PRIVATE KEY':'PUBLIC KEY';
  if(!new RegExp('^-----BEGIN '+label+'-----[\\r\\n]+[A-Za-z0-9+/=\\r\\n]+-----END '+label+'-----\\s*$').test(text)||text.length>16384)fail();
  const key=privateKey?createPrivateKey(text):createPublicKey(text);if(key.asymmetricKeyType!=='ed25519')fail();return key;
 }catch{fail();}
}
export function matchingKeys(privateBytes,publicBytes){
 const a=createPublicKey(signingKey(privateBytes,true)).export({type:'spki',format:'der'}),b=signingKey(publicBytes).export({type:'spki',format:'der'});
 if(a.length!==b.length||!timingSafeEqual(a,b))fail();
}
// Fixed-order JSON array of closed primitive fields is the canonical UTF-8 payload.
const payload=(artifact,m,ciphertext,metadata)=>Buffer.from(JSON.stringify(['nexus.backup.ed25519',1,artifact,m.project,m.created,hash(ciphertext),hash(metadata),m.version]),'utf8');
export function signEnvelope(artifact,m,ciphertext,metadata,privateBytes){
 try{return JSON.stringify({domain:'nexus.backup.ed25519',version:1,signature:sign(null,payload(artifact,m,ciphertext,metadata),signingKey(privateBytes,true)).toString('base64')})+'\n';}catch{fail();}
}
export function authenticateEnvelope(artifact,m,ciphertext,metadata,attestation,publicBytes){
 try{
  const a=JSON.parse(attestation);exactKeys(a,['domain','version','signature']);
  if(a.domain!=='nexus.backup.ed25519'||a.version!==1||typeof a.signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(a.signature))fail();
  const signature=Buffer.from(a.signature,'base64');
  if(signature.length!==64||signature.toString('base64')!==a.signature)fail();
  if(!verify(null,payload(artifact,m,ciphertext,metadata),signingKey(publicBytes),signature))fail();
 }catch{fail();}
}
