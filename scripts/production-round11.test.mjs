import test from 'node:test';
import assert from 'node:assert/strict';
import {finishOperation,operationFailureLines} from './production-operation-outcome.mjs';
for(const code of ['NEXUS_BACKUP_AVAILABILITY','NEXUS_RESTORE_CLEANUP','GENERIC',null])test('round11: awaited cleanup retains '+code,async()=>{
 const primary=code?Object.assign(Error('private path'),{code}):undefined;
 const cleanup=Object.assign(Error('external stderr'),{code:'NEXUS_OPERATION_LOCK_CLEANUP'});
 await assert.rejects(async()=>finishOperation(primary,async()=>{await Promise.resolve();throw cleanup;}),error=>{
  const lines=operationFailureLines(error);
  assert.equal(lines.length,code?2:1);
  assert.match(lines.at(-1),/NEXUS_OPERATION_LOCK_CLEANUP/);
  assert.doesNotMatch(lines.join('\n'),/private path|external stderr/);
  return true;
 });
});
test('round11: awaited verified release precedes success',async()=>{
 let complete=false;
 await finishOperation(undefined,async()=>{await Promise.resolve();complete=true;});
 assert.equal(complete,true);
});
