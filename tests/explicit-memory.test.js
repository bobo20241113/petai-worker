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

test('mixed owner description and question saves breed, age, weight and raw vaccine month during model outage',()=>{
 const msg='我有一只柯基, 3岁半, 体重10Kg, 上次打疫苗是去年11月份, 现在还需要打吗';
 const result=reliableMemory('',msg,[],null);assert.equal(result.operations.find(o=>o.field==='species').value,'狗');assert.equal(result.operations.find(o=>o.field==='breed_description').value,'柯基');assert.equal(result.operations.find(o=>o.field==='age_note').value,'3岁半');assert.equal(result.operations.find(o=>o.category==='weight').details.kg,10);const v=result.operations.find(o=>o.category==='vaccine');assert.equal(v.date_text,'去年11月份');assert.equal(v.occurred_on,null);assert.ok(result.operations.every(o=>msg.includes(o.quote)));assert.ok(!result.operations.some(o=>o.field==='birth_date'||o.field==='name'));assert.deepEqual([...new Set(result.operations.map(o=>o.pet))],['@new']);
 const cat={id:'11111111-1111-4111-8111-111111111111',species:'猫',ownership_confirmed:true};assert.equal(reliableMemory('',msg,[cat],null).operations.length,5);
});
test('question-only facts and future/uncertain vaccine claims are not persisted as completed events',()=>{
 for(const msg of ['这是什么柯基？','我想要一只柯基，3岁半，体重10kg','我有一只柯基，可能体重10kg，现在需要打疫苗吗','我有一只柯基，上次打的是什么疫苗？']){
  const ops=explicitMemory(msg,[],null).operations;if(msg.includes('想要')||msg.startsWith('这'))assert.equal(ops.length,0);assert.ok(!ops.some(o=>o.category==='vaccine'));if(msg.includes('可能'))assert.ok(!ops.some(o=>o.category==='weight'));
 }
});
