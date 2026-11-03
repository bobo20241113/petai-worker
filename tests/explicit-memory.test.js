import test from 'node:test';import assert from 'node:assert/strict';import {explicitMemory,reliableMemory} from '../src/explicit-memory.js';
const message='我家有一只猫，名字叫豆豆，品种是英短，年龄是2岁，体重4.5公斤，2026-10-01打了猫三联。';
test('extraction outage still produces grounded owner facts and weight/vaccine records',()=>{
 const p=reliableMemory('',message,[],null);assert.equal(p.operations.find(o=>o.field==='name').value,'豆豆');assert.equal(p.operations.find(o=>o.field==='species').value,'猫');assert.equal(p.operations.find(o=>o.field==='age_note').value,'2岁');assert.equal(p.operations.find(o=>o.field==='breed_description').value,'英短');assert.equal(p.operations.find(o=>o.category==='weight').details.kg,4.5);assert.equal(p.operations.find(o=>o.category==='vaccine').date_text,'2026-10-01');for(const o of p.operations)assert.ok(message.includes(o.quote));assert.ok(p.owned_refs.includes('豆豆'));
 assert.equal(reliableMemory('{"operations":[]}',message,[],null).operations.length,p.operations.length);
});
test('backup refuses questions, plans, third parties, uncertain or ambiguous multi-pet statements',()=>{
 for(const msg of ['我家猫要不要打疫苗？','朋友的猫名字叫豆豆，体重4公斤。','如果我家有一只猫，名字叫豆豆。','我家有两只猫，名字叫豆豆，体重4公斤。','不要记录，我家猫名字叫豆豆。','我家猫可能体重4公斤。'])assert.equal(explicitMemory(msg,[],null).operations.length,0,msg);
});

test('merging @new model operations into a named explicit introduction does not create a second pet',()=>{const answer=JSON.stringify({operations:[{type:'fact',pet:'@new',field:'species',value:'猫',quote:message}]});const p=reliableMemory(answer,message,[],null);assert.deepEqual([...new Set(p.operations.map(o=>o.pet))],['豆豆']);});
