// PUBLIC RFC 8032 section 7.1 test vector #1. Never use for any real artifact.
// Fixed published bytes, not newly generated operational key material.
import {createPrivateKey,createPublicKey} from 'node:crypto';
export const testPrivateKey=createPrivateKey({key:Buffer.from('302e020100300506032b6570042204209d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60','hex'),format:'der',type:'pkcs8'}).export({format:'pem',type:'pkcs8'});
export const testPublicKey=createPublicKey({key:Buffer.from('302a300506032b6570032100d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a','hex'),format:'der',type:'spki'}).export({format:'pem',type:'spki'});
