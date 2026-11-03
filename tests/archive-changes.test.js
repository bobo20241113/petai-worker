import test from 'node:test';import assert from 'node:assert/strict';import {archiveChanges} from '../src/archive-changes.js';
const U='11111111-1111-4111-8111-111111111111',P='22222222-2222-4222-8222-222222222222',T='33333333-3333-4333-8333-333333333333',I='44444444-4444-4444-8444-444444444444';
test('receipts group real updates and only open suggestions, owner scoped, including multiple fields',async()=>{
 let pending=true,reads=0;const db={rows:async(table,q)=>{assert.equal(q.owner_id,'eq.'+U);reads++;
 if(table==='archive_change_receipts'){assert.equal(q.turn_id,'in.('+T+')');return [{turn_id:T,pet_id:P,kind:'updated',field:'age_note'},{turn_id:T,pet_id:P,kind:'updated',field:'weight_kg'},{turn_id:T,pet_id:P,kind:'review',field:'weight_kg',issue_id:I}]}
 if(table==='memory_issues'){assert.equal(q.status,'eq.open');return pending?[{id:I}]:[]}
 if(table==='pets')return [{id:P,name:'豆豆',name_confirmed:true,ownership_confirmed:true}];if(table==='pet_facts'||table==='pet_manual_fields')return [];throw Error(table)}};
 let result=await archiveChanges(db,U,[T]);assert.equal(result.length,1);assert.deepEqual(result[0].updated_fields,['age_note','weight_kg']);assert.deepEqual(result[0].review_fields,['weight_kg']);pending=false;result=await archiveChanges(db,U,[T]);assert.deepEqual(result[0].review_fields,[]);const before=reads;assert.deepEqual(await archiveChanges(db,U,[]),[]);assert.equal(reads,before);
});
test('no real write means no archive update receipt',async()=>{let calls=0;const db={rows:async()=>{calls++;return []}};assert.deepEqual(await archiveChanges(db,U,[T]),[]);assert.equal(calls,1)});
