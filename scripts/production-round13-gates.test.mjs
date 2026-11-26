import test from 'node:test';
import assert from 'node:assert/strict';
import * as locks from './production-resident-lock.mjs';
test('round13 synchronous external steps gate before and after, including failure',()=>{
 assert.equal(typeof locks.checkedStep,'function');
 for(const throws of [false,true]){
 const events=[],release={check(){events.push('check');}};
 const step=()=>{events.push('step');if(throws)throw Error('step failed');return 42;};
 if(throws)assert.throws(()=>locks.checkedStep(release,step));else assert.equal(locks.checkedStep(release,step),42);
 assert.deepEqual(events,['check','step','check']);
 }
 const primary=Object.assign(Error('step'),{code:'NEXUS_BACKUP_AVAILABILITY'}),cleanup=Object.assign(Error('dead'),{code:'NEXUS_OPERATION_LOCK_CLEANUP'});let calls=0;
 assert.throws(()=>locks.checkedStep({check(){if(++calls===2)throw cleanup;}},()=>{throw primary;}),e=>e instanceof AggregateError&&e.errors[0]===primary&&e.errors[1]===cleanup);
 let mutated=false;assert.throws(()=>locks.checkedStep({check(){throw Error('dead');}},()=>{mutated=true;}));assert.equal(mutated,false);
 assert.throws(()=>locks.checkedStep({check(){if(mutated)throw Error('dead');}},()=>{mutated=true;return 'success';}));
});
