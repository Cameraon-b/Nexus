import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {auditBackupCompose} from './production-backup-audit.mjs';

test('held Linux candidate root accepts only its canonical rendered build context',t=>{
 const dir=fs.mkdtempSync(join(tmpdir(),'nexus-pinned-root-'));
 let fd;
 try{
  const canonical=fs.realpathSync(dir);
  // Windows cannot open a directory fd: emulate only the two proc lookups.
  // On Linux this exercises a real, held /proc/<owner>/fd/<n> directory.
  const root=process.platform==='linux'
   ? `/proc/${process.pid}/fd/${fd=fs.openSync(canonical,'r')}`
   : '/proc/12345/fd/42';
  if(process.platform!=='linux'){
   const realpath=fs.realpathSync,stat=fs.statSync;
   t.mock.method(fs,'realpathSync',p=>p===root?canonical:realpath(p));
   t.mock.method(fs,'statSync',(p,o)=>stat(p===root?canonical:p,o));
  }
  const c=JSON.parse(fs.readFileSync(new URL('./fixtures/restore-compose.json',import.meta.url)));
  const project=c.name,secret=c.secrets.database_password.file;
  const audit=()=>auditBackupCompose(c,{project,secret,root});
  for(const s of Object.values(c.services))if(s.build)s.build.context=canonical;
  assert.doesNotThrow(audit);
  c.services.migrate.build.context=join(canonical,'different');
  fs.mkdirSync(c.services.migrate.build.context);
  assert.throws(audit);
  // Even an alias to the same directory is not the canonical rendered path.
  const alias=join(canonical,'alias');
  fs.symlinkSync(canonical,alias,process.platform==='win32'?'junction':'dir');
  c.services.migrate.build.context=alias;
  assert.throws(audit);
  fs.unlinkSync(alias);
 }finally{
  if(fd!==undefined)fs.closeSync(fd);
  t.mock.restoreAll();
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
