import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync,linkSync,mkdirSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {artifactNames,readBoundedSnapshot} from './production-envelope.mjs';
const helper=new URL('./windows-retire-quartet.ps1',import.meta.url);
const digest=b=>createHash('sha256').update(b).digest('hex');
export function fixture(fn){const directory=mkdtempSync(join(tmpdir(),'nexus-r7-'));const members=Object.values(artifactNames('2024-01-01T00:00:00Z')).map(name=>{writeFileSync(join(directory,name),'approved');const s=readBoundedSnapshot(join(directory,name),100);return {name,length:8,sha256:digest('approved'),device:s.device,inode:s.inode};});return Promise.resolve().then(()=>fn({directory,members})).finally(()=>rmSync(directory,{recursive:true,force:true}));}
function invoke(request){return spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper.pathname.replace(/^\/([A-Za-z]:)/,'$1')],{input:typeof request==='string'?request:JSON.stringify(request),encoding:'utf8',timeout:30000,shell:false,maxBuffer:4096});}
test('round7: real Windows helper deletes exact quartet', {skip:process.platform!=='win32'},()=>fixture(async r=>{const result=invoke({version:1,...r});assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'NEXUS_RETENTION_OK\r\n');for(const m of r.members)assert.equal(existsSync(join(r.directory,m.name)),false);}));
for(const fault of ['hash','length','hardlink','directory','missing','unknown','member-unknown','duplicate','escaped-duplicate','malformed','replacement','symlink','digest-newline'])test('round7: real helper refuses '+fault+' without deleting siblings',{skip:process.platform!=='win32'},()=>fixture(async r=>{
 const p=join(r.directory,r.members[3].name);let request={version:1,...r};
 if(fault==='hash')r.members[3].sha256='0'.repeat(64);
 if(fault==='digest-newline')r.members[3].sha256+='\n';
 if(fault==='length')r.members[3].length++;
 if(fault==='hardlink')linkSync(p,join(r.directory,'alias'));
 if(fault==='directory'){rmSync(p);mkdirSync(p);}
 if(fault==='missing')rmSync(p);
 if(fault==='unknown')request.extra=true;
 if(fault==='member-unknown')r.members[3].extra=true;
 if(fault==='duplicate')request=JSON.stringify(request).replace('"version":1','"version":1,"version":1');
 if(fault==='escaped-duplicate')request=JSON.stringify(request).replace('"version":1','"version":1,"\\u0076ersion":1');
 if(fault==='symlink'){rmSync(p);writeFileSync(join(r.directory,'target'),'approved');symlinkSync(join(r.directory,'target'),p,'file');}
 if(fault==='malformed')request='{';
 if(fault==='replacement')writeFileSync(p,'replaced');
 const result=invoke(request);assert.equal(result.status,1);assert.equal(result.stdout,'NEXUS_RETENTION_REFUSED\r\n');assert.equal(result.stderr,'');for(const m of r.members.slice(0,3))assert.equal(readFileSync(join(r.directory,m.name),'utf8'),'approved');
}));
test('round7: Node retirement rechecks descriptors and requires exact helper success',()=>fixture(async r=>{
 const {retireQuartet}=await import('./production-retention.mjs');
 const descriptors={};const snapshots=Object.fromEntries(r.members.map(m=>{const s=readBoundedSnapshot(join(r.directory,m.name),100,{holdDescriptor:true});descriptors[m.name]=s.fd;return [m.name,{...m,identity:s.identity}];}));
 await retireQuartet(r.directory,snapshots,{descriptors});
 for(const m of r.members)assert.equal(existsSync(join(r.directory,m.name)),false);
}));
