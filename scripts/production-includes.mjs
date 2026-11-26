import {X509Certificate,createPrivateKey,createPublicKey} from 'node:crypto';
import {includeNames,fail} from './production-recovery.mjs';
export const maxIncludeBytes=1024*1024;
export function validateIncludes(files){
 try{
  const values={};for(const name of includeNames){const b=files['includes/'+name];if(!Buffer.isBuffer(b)||!b.length||b.length>maxIncludeBytes)fail();const s=new TextDecoder('utf-8',{fatal:true}).decode(b);if(!s.trim()||s.includes('\0'))fail();values[name]=s;}
  // Matches production's trimmed-nonempty password contract, not a new password policy.
  for(const name of ['npm-current.json','npm-rollback.json']){const obj=JSON.parse(values[name]);if(!obj||typeof obj!=='object'||Array.isArray(obj)||!Object.keys(obj).length)fail();}
  const certificate=new X509Certificate(values['certificate.pem']),privateKey=createPrivateKey(values['certificate-key.pem']);
  if(!certificate.publicKey.export({type:'spki',format:'der'}).equals(createPublicKey(privateKey).export({type:'spki',format:'der'})))fail();
 }catch{fail();}
}
