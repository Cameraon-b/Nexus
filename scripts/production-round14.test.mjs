import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {restoreStack} from './production-restore.mjs';
import {fakeRestore,project,metadata,keys} from './fixtures/restore-runner.mjs';
import {operationFailureLines} from './production-operation-outcome.mjs';
const config={identity:'/private/identity',tempRoot:'/private/temp',sourceProject:'nexus_prod_example',host:'localhost',bindIp:'127.0.0.1',port:49991,backendSubnet:'10.251.10.0/24',backendDynamicRange:'10.251.10.128/25',frontendIp:'10.251.10.2',edgeSubnet:'10.251.11.0/24',edgeDynamicRange:'10.251.11.128/25',edgeProxy:'10.251.11.2'};
for(const defect of ['down','absence'])test('round14 primary restore plus '+defect+' failure preserves ordered safe errors and material',()=>{
 const d=mkdtempSync(join(resolve('artifacts'),'nexus-r14-'));
 try{
  const root=join(d,'repo'),stage=join(d,'stage');mkdirSync(root);mkdirSync(stage);
  const o={root,stage,project,config,metadata,files:{'includes/database-password':Buffer.from('synthetic'),'database.dump':Buffer.from('PGDMPfake'),'keys.tar':keys}};
  const f=fakeRestore({...o,mutate:(r,c)=>{
   if(c.args.includes('pg_restore'))throw Error('SECRET primary pathname');
   if(defect==='down'&&c.args.includes('down'))throw Error('SECRET teardown pathname');
   if(defect==='absence'&&c.down&&c.args[1]==='ls')return 'retained';
   return r;
  }});
  assert.throws(()=>restoreStack({...o,run:f.run}),e=>{
   assert.ok(e instanceof AggregateError);assert.equal(e.errors.length,2);
   assert.equal(e.errors[0].message,'Recovery operation refused; inspect private configuration and exact-project recovery state.');
   assert.equal(e.errors[1].code,'NEXUS_RESTORE_CLEANUP');
   assert.ok(!JSON.stringify(operationFailureLines(e)).includes('SECRET'));
   assert.match(operationFailureLines(e)[1],/^NEXUS_RESTORE_CLEANUP/);return true;
  });
 }finally{rmSync(d,{recursive:true,force:true});}
});
