import {snapshotKey} from './production-key-snapshot.mjs';
import {lstatSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fail} from './production-recovery.mjs';
// Public code only in EncodedCommand; private input path stays on stdin.
const aclScript=`$ErrorActionPreference='Stop';try{$p=[Console]::In.ReadToEnd();$a=Get-Acl -LiteralPath $p;$u=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;$trusted=@($u,'S-1-5-18','S-1-5-32-544');if($a.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin $trusted){throw 'owner'};$raw=[Security.AccessControl.RawSecurityDescriptor]::new($a.GetSecurityDescriptorBinaryForm(),0);if($null -eq $raw.DiscretionaryAcl){throw 'acl'};foreach($r in $a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){if($r.AccessControlType -eq 'Allow' -and [int]$r.FileSystemRights -ne 0 -and $r.IdentityReference.Value -notin $trusted){throw 'write'}};[Console]::Out.Write('verified')}catch{exit 1}`;
const encoded=Buffer.from(aclScript,'utf16le').toString('base64');
function privateInput(path){
 if(process.platform==='linux'){
  const s=lstatSync(path);if(s.uid!==process.getuid()||![0o400,0o600].includes(s.mode&0o7777))fail();
  const r=spawnSync('python3',['-c',"import os,sys\na=os.listxattr(sys.argv[1],follow_symlinks=False)\nsys.exit(int('system.posix_acl_access' in a))",path],{encoding:'utf8',timeout:30000,maxBuffer:65536,shell:false});if(r.error||r.status!==0)fail();
 }else if(process.platform==='win32'){
  const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',encoded],{input:path,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:65536,shell:false});if(r.error||r.status!==0||r.stdout!=='verified')fail();
 }else fail();
}
export function snapshotInput(path,root,cap=64*1024){
 // Snapshot before and after ACL inspection binds the ACL review to exactly
 // the regular single-link file read, rather than validating another pathname.
 const before=snapshotKey(path,root,{cap});privateInput(before.source);
 const after=snapshotKey(path,root,{cap});
 if(before.identity!==after.identity||!before.bytes.equals(after.bytes))fail();
 return Object.freeze({...before,cap});
}
export function recheckInput(snapshot,root){
 const current=snapshotInput(snapshot.source,root,snapshot.cap);
 if(current.identity!==snapshot.identity||!current.bytes.equals(snapshot.bytes))fail();
}
export const recoverySnapshots=Symbol('recovery input snapshots');
export function checkRecoveryInputs(config,root){for(const s of Object.values(config[recoverySnapshots]??{}))recheckInput(s,root);}
