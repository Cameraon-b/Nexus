import {readFileSync,lstatSync,readdirSync,realpathSync,openSync,readSync,closeSync,fstatSync,constants} from 'node:fs';
import {join,basename,dirname,resolve} from 'node:path';
import {fail,hash,exactKeys,includeNames,validateRecipientFingerprint} from './production-recovery.mjs';
import {authenticateEnvelope} from './production-signing.mjs';
export {signEnvelope} from './production-signing.mjs';
import {validateAggregates} from './production-aggregates.mjs';
export const artifactPattern=/^nexus-backup-(\d{8}T\d{6}Z)\.tar\.age$/;
export function artifactNames(created){
 if(typeof created!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(created)||!Number.isFinite(Date.parse(created))||new Date(created).toISOString()!==created.replace('Z','.000Z'))fail();
 const stem='nexus-backup-'+created.replace(/[-:]/g,'');return {artifact:stem+'.tar.age',sidecar:stem+'.tar.age.sha256',metadata:stem+'.metadata.json',signature:stem+'.signature.json'};
}
export function validateMetadata(m,project){
 exactKeys(m,['version','created','project','commit','images','imageIds','services','migrationCount','inventory','keyFingerprint','aggregates','recipientFingerprint']);
 validateRecipientFingerprint(m.recipientFingerprint);
 validateAggregates(m.aggregates);
 if(m.migrationCount!==m.aggregates.migrations)fail();
 if(m.version!==2||m.project!==project||!/^nexus_(prod|s8)_[a-z0-9_]+$/.test(m.project)||!/^[a-f0-9]{40}$/.test(m.commit)||!/^[a-f0-9]{64}$/.test(m.keyFingerprint))fail();
 artifactNames(m.created);exactKeys(m.images,['api','frontend','postgres']);exactKeys(m.imageIds,['api','frontend','postgres']);
 if(Object.values(m.imageIds).some(id=>typeof id!=='string'||!/^sha256:[a-f0-9]{64}$/.test(id)))fail();
 if(m.images.api!=='nexus-api:'+m.commit||m.images.frontend!=='nexus-frontend:'+m.commit||m.images.postgres!=='postgres:18@sha256:979bccfde35445db618c65107d27d08c6c21339d8dc3ad4c830c6633947be0e4')fail();
 if(JSON.stringify(m.services)!==JSON.stringify(['api','frontend','migrate','postgres'])||!Number.isSafeInteger(m.migrationCount)||m.migrationCount<1)fail();
 exactKeys(m.inventory,['database.dump','keys.tar',...includeNames.map(n=>'includes/'+n)]);
 if(Object.values(m.inventory).some(h=>typeof h!=='string'||!/^[a-f0-9]{64}$/.test(h)))fail();return m;
}
// Both ciphertext and decrypted archive are bounded in memory, not streamed.
export const maxCiphertextBytes=513*1024*1024;
export const quartetLimits=Object.freeze({artifact:maxCiphertextBytes,sidecar:256,metadata:16*1024,signature:4*1024});
// Read at most cap+1, even if a regular file grows after fstat.
export const memberIdentity=s=>[s.dev,s.ino,s.mode,s.nlink,s.size].join(':');
export function readBoundedSnapshot(path,cap,{holdDescriptor=false}={}){
 let fd,held=false;
 try{const before=lstatSync(path,{bigint:true});fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));const st=fstatSync(fd,{bigint:true});if(!st.isFile()||st.nlink!==1n||st.size>BigInt(cap)||memberIdentity(before)!==memberIdentity(st))fail();const chunks=[];let size=0;
  while(true){const b=Buffer.alloc(Math.min(64*1024,cap+1-size)),n=readSync(fd,b,0,b.length,null);if(!n)break;size+=n;if(size>cap)fail();chunks.push(b.subarray(0,n));}
  if(memberIdentity(fstatSync(fd,{bigint:true}))!==memberIdentity(st))fail();
  held=holdDescriptor;return {bytes:Buffer.concat(chunks,size),identity:memberIdentity(st),device:st.dev.toString(),inode:st.ino.toString(),...(held?{fd}:{})};
 }catch{fail();}finally{if(fd!==undefined&&!held)closeSync(fd);}
}
export function readBoundedFile(path,cap){return readBoundedSnapshot(path,cap).bytes;}
export function verifyEnvelope(root,artifact,project,verificationKey,recipientFingerprint){return verifyEnvelopeBytes(root,artifact,project,verificationKey,recipientFingerprint).metadata;}
export function verifyEnvelopeBytes(root,artifact,project,verificationKey,recipientFingerprint,{holdDescriptors=false}={}){
 const descriptors={};let handedOff=false;
 try{
  validateRecipientFingerprint(recipientFingerprint);
  if(!artifactPattern.test(artifact)||basename(artifact)!==artifact)fail();
  const stamp=artifactPattern.exec(artifact)[1],created=stamp.replace(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/,'$1-$2-$3T$4:$5:$6Z'),n=artifactNames(created);
  const stem=artifact.slice(0,-8);
  if(readdirSync(root).some(name=>name.startsWith(stem)&&(name.endsWith('.partial')||name.endsWith('.staging')||name.includes('.staging-'))))fail();
  const members={},retirementMembers={};
  const read=(name,cap)=>{const p=join(root,name);if(lstatSync(p).isSymbolicLink()||!lstatSync(p).isFile()||resolve(dirname(realpathSync(p)))!==resolve(realpathSync(root)))fail();const snapshot=readBoundedSnapshot(p,cap,{holdDescriptor:holdDescriptors});if(holdDescriptors)descriptors[name]=snapshot.fd;members[name]=snapshot.identity;retirementMembers[name]={name,sha256:hash(snapshot.bytes),length:snapshot.bytes.length,identity:snapshot.identity,device:snapshot.device,inode:snapshot.inode};return snapshot.bytes;};
  if(lstatSync(join(root,n.artifact)).size>maxCiphertextBytes)fail();
  const encrypted=read(n.artifact,quartetLimits.artifact);if(!encrypted.length||encrypted.length>maxCiphertextBytes)fail();
  if(read(n.sidecar,quartetLimits.sidecar).toString('utf8')!==hash(encrypted)+'  '+n.artifact+'\n')fail();
  const metadata=read(n.metadata,quartetLimits.metadata),candidate=JSON.parse(metadata);
  // Candidate fields are untrusted until the detached signature and pinned key verify.
  authenticateEnvelope(artifact,candidate,encrypted,metadata,read(n.signature,quartetLimits.signature),Buffer.isBuffer(verificationKey)?verificationKey:readFileSync(verificationKey));
  const m=validateMetadata(candidate,project);if(m.created!==created||m.recipientFingerprint!==recipientFingerprint)fail();handedOff=holdDescriptors;return {metadata:m,ciphertext:encrypted,members,retirementMembers,descriptors};
 }catch{fail();}finally{if(!handedOff)for(const fd of Object.values(descriptors))closeSync(fd);}
}
