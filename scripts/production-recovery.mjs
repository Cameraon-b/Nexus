import {snapshotInput,recoverySnapshots} from './production-input-snapshot.mjs';
import {createHash} from 'node:crypto';
import {readFileSync,realpathSync,lstatSync,statSync} from 'node:fs';
import {isAbsolute,relative,resolve,sep,dirname} from 'node:path';
import {validateIncludes} from './production-includes.mjs';
import {validateKeyXml} from './production-key-xml.mjs';
import {signingKey,matchingKeys} from './production-signing.mjs';
export const fail=()=>{throw Error('Recovery operation refused; inspect private configuration and exact-project recovery state.');};
export const hash=data=>createHash('sha256').update(data).digest('hex');
export function validateRecipientFingerprint(value){if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))fail();return value;}
export const includeNames=['production.env','database-password','certificate.pem','certificate-key.pem','npm-current.json','npm-rollback.json'];
const inside=(base,path)=>{const r=relative(base,path);return !r||(!isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep));};
export function externalPath(path,root,directory=false){
 try{
  if(typeof path!=='string'||!isAbsolute(path))fail();
  for(let part=resolve(path);;part=dirname(part)){if(lstatSync(part).isSymbolicLink())fail();if(dirname(part)===part)break;}
  const canonical=realpathSync(path),base=realpathSync(root);
  if(inside(base,resolve(path))||inside(base,canonical)||lstatSync(path).isSymbolicLink())fail();
  const info=statSync(canonical);
  if(directory?!info.isDirectory():(!info.isFile()||info.nlink!==1))fail();
  return canonical;
 }catch{fail();}
}
export function exactKeys(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join('|')!==[...keys].sort().join('|'))fail();}
export function loadBackupConfig(path,root,{transportOnly=false,pinnedConfig}={}){
 try{
  const configSnapshot=snapshotInput(path,root,64*1024);
  const c=JSON.parse(configSnapshot.bytes.toString('utf8'));
  exactKeys(c,['output','recipient','recipientFingerprint','age','includes','signingKey','verificationKey']);
  validateRecipientFingerprint(c.recipientFingerprint);
  c.verificationKey=externalPath(c.verificationKey,root);
  const verificationSnapshot=snapshotInput(c.verificationKey,root);signingKey(verificationSnapshot.bytes);
  const snapshots={config:configSnapshot,verificationKey:verificationSnapshot};
  if(typeof c.signingKey!=='string'||!isAbsolute(c.signingKey))fail();
  if(!transportOnly){c.signingKey=externalPath(c.signingKey,root);snapshots.signingKey=snapshotInput(c.signingKey,root);matchingKeys(snapshots.signingKey.bytes,verificationSnapshot.bytes);}
  c.output=externalPath(c.output,root,true);
  for(const key of ['recipient','age']){if(typeof c[key]!=='string'||!isAbsolute(c[key]))fail();if(!transportOnly)c[key]=externalPath(c[key],root);}
  if(!Array.isArray(c.includes)||c.includes.length!==includeNames.length)fail();
  const names=new Set();c.includes=c.includes.map(i=>{exactKeys(i,['name','source']);if(!includeNames.includes(i.name)||names.has(i.name))fail();names.add(i.name);if(typeof i.source!=='string'||!isAbsolute(i.source))fail();if(!transportOnly&&pinnedConfig&&i.name==='production.env'){if(i.source!==pinnedConfig.original)fail();return {name:i.name,source:pinnedConfig.path};}return {name:i.name,source:transportOnly?i.source:externalPath(i.source,root)};});
  Object.defineProperty(c,recoverySnapshots,{value:Object.freeze(snapshots)});
  return c;
 }catch{fail();}
}
const safeName=name=>typeof name==='string'&&/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(name)&&!name.split('/').some(p=>p==='.'||p==='..');
// Deliberately bounded USTAR subset. No PAX/GNU extensions, links or special files.
export function packTar(entries){
 const chunks=[];
 for(const [name,value] of Object.entries(entries)){
  const data=Buffer.from(value),h=Buffer.alloc(512);
  if(Buffer.byteLength(name)>100)fail();h.write(name,0,100,'utf8');
  const oct=(n,p,l)=>h.write(n.toString(8).padStart(l-1,'0')+'\0',p,l,'ascii');
  oct(0o600,100,8);oct(0,108,8);oct(0,116,8);oct(data.length,124,12);oct(0,136,12);
  h.fill(32,148,156);h[156]=48;h.write('ustar\0',257,6,'ascii');h.write('00',263,2);
  const sum=h.reduce((a,b)=>a+b,0);h.write(sum.toString(8).padStart(6,'0')+'\0 ',148,8,'ascii');
  chunks.push(h,data,Buffer.alloc((512-data.length%512)%512));
 }
 return Buffer.concat([...chunks,Buffer.alloc(1024)]);
}
export function unpackTar(buffer,{keys=false}={}){
 if(!Buffer.isBuffer(buffer)||buffer.length%512||buffer.length<1024)fail();
 const entries=Object.create(null);let end=false;
 for(let p=0;p<buffer.length;){
  const h=buffer.subarray(p,p+512);p+=512;
  if(h.every(x=>x===0)){if(buffer.length-p<512||!buffer.subarray(p).every(x=>x===0))fail();end=true;break;}
  const str=(a,b)=>h.subarray(a,b).toString('utf8').split('\0')[0];
  const oct=(a,b)=>{const s=str(a,b).trim();if(!/^[0-7]+$/.test(s))fail();return parseInt(s,8);};
  const check=Buffer.from(h);check.fill(32,148,156);if(check.reduce((a,b)=>a+b,0)!==oct(148,156))fail();
  if(!['ustar','ustar '].includes(str(257,263))||str(345,500))fail();
  let name=str(0,100);const type=String.fromCharCode(h[156]);const size=oct(124,136);
  if(size>512*1024*1024||p+Math.ceil(size/512)*512>buffer.length)fail();
  if(keys&&type==='5'&&(name==='./'||name==='.')&&size===0)continue;
  if(keys&&name.startsWith('./'))name=name.slice(2);
  if(!safeName(name)||!['0','\0'].includes(type)||Object.hasOwn(entries,name))fail();
  if(keys&&(!/^key-[a-fA-F0-9-]+\.xml$/.test(name)||oct(100,108)!==0o600))fail();
  entries[name]=Buffer.from(buffer.subarray(p,p+size));p+=Math.ceil(size/512)*512;
 }
 if(!end||!Object.keys(entries).length)fail();return entries;
}
export function keyFingerprint(tar){const files=unpackTar(tar,{keys:true});for(const [name,bytes] of Object.entries(files))validateKeyXml(name,bytes);return hash(JSON.stringify(Object.keys(files).sort().map(k=>[k,hash(files[k])])));}
export function validatePlaintext(tar,metadata){
 try{
  const files=unpackTar(tar),expected=['database.dump','keys.tar','metadata.json',...includeNames.map(n=>'includes/'+n)];
  if(Object.keys(files).sort().join('|')!==[...expected,'manifest.json'].sort().join('|'))fail();
  const manifest=JSON.parse(files['manifest.json']);exactKeys(manifest,expected);
  for(const name of expected)if(manifest[name]!==hash(files[name]))fail();
  const inventoryNames=['database.dump','keys.tar',...includeNames.map(n=>'includes/'+n)];
  exactKeys(metadata.inventory,inventoryNames);
  for(const name of inventoryNames)if(metadata.inventory[name]!==hash(files[name]))fail();
  if(!files['database.dump'].subarray(0,5).equals(Buffer.from('PGDMP')))fail();
  if(JSON.stringify(JSON.parse(files['metadata.json']))!==JSON.stringify(metadata))fail();
  validateIncludes(files);
  if(keyFingerprint(files['keys.tar'])!==metadata.keyFingerprint)fail();
  return files;
 }catch{fail();}
}
