import test from 'node:test';import assert from 'node:assert/strict';import {prepareSemanticMemory} from '../src/semantic-memory.js';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const pets=[{id:A,name:'茄茄',species:'狗',ownership_confirmed:true}];
const subject=(ref,identity,quote,extra={})=>({ref,identity,relation:'owned',certainty:'certain',name:null,evidence:{source:'current',quote},...extra});
const envelope=(subjects,operations,focus_ref)=>JSON.stringify({schema_version:2,consent:'allowed',subjects,operations,focus_ref,state:{goal:'养宠咨询'}});
const weight=(pet,quote,kg)=>({type:'record',pet,category:'weight',event_status:'completed',kg,quote,description:'用户提供的体重'});
test('semantic aliases handle varied additional-pet wording without keyword gates or writing to current dog',()=>{
 for(const [message,breed] of [['我还有一只泰迪,5kg是否太轻了？','泰迪'],['另外那个小家伙是我养的贵宾，五公斤，偏轻吗','贵宾'],['家里新添的那位约克夏刚称完重，5公斤','约克夏'],['前面说的是茄茄；现在聊我收养的第二只犬，它5kg',null],['我负责照顾另一个爱尔兰软毛麦色梗，五公斤','爱尔兰软毛麦色梗']]){
  const ops=[{type:'fact',pet:'new_b',field:'species',value:'狗',quote:message},...(breed?[{type:'fact',pet:'new_b',field:'breed_description',value:breed,quote:message}]:[]),weight('new_b',message,5)];
  const p=prepareSemanticMemory(envelope([subject('new_b','new',message)],ops,'new_b'),message,pets,A);
  assert.deepEqual([...new Set(p.operations.map(o=>o.pet))],['@new:new_b']);assert.equal(p.focus_ref,'@new:new_b');assert.equal(p.operations.at(-1).details.kg,5);assert.ok(!p.operations.some(o=>o.field==='name'));
 }
});
test('semantic existing subject reuses exact owner-scoped ID; uncertain or third-party subjects cannot write',()=>{
 const msg='它今天是15公斤';let p=prepareSemanticMemory(envelope([subject(A,'existing',msg)],[weight(A,msg,15)],A),msg,pets,A);assert.equal(p.operations[0].pet,A);assert.equal(p.focus_ref,A);
 for(const extra of [{relation:'third_party'},{relation:'unknown'},{certainty:'uncertain'}]){p=prepareSemanticMemory(envelope([subject('new_a','new',msg,extra)],[weight('new_a',msg,15)],null),msg,pets,A);assert.equal(p.operations.length,0);assert.equal(p.focus_ref,null)}
 assert.throws(()=>prepareSemanticMemory(envelope([subject(B,'existing',msg)],[weight(B,msg,5)],B),msg,pets,A));
});
test('semantic path only accepts user evidence, exact op quotes, explicit names, valid record states and v2 protocol',()=>{
 const msg='我新增一个宠物伙伴',s=subject('new_a','new',msg);
 assert.throws(()=>prepareSemanticMemory(envelope([{...s,evidence:{source:'current',quote:'杜撰证据'}}],[],null),msg,pets,A));
 assert.throws(()=>prepareSemanticMemory(envelope([s],[weight('new_a','不存在的原话',5)],'new_a'),msg,pets,A));
 assert.throws(()=>prepareSemanticMemory(envelope([s],[{type:'fact',pet:'new_a',field:'name',value:'泰迪',quote:msg}],'new_a'),msg,pets,A));
 assert.throws(()=>prepareSemanticMemory('{"operations":[]}',msg,pets,A));
 assert.throws(()=>prepareSemanticMemory(envelope([s],[{...weight('new_a',msg,5),event_status:'planned'}],'new_a'),msg,pets,A));
 assert.throws(()=>prepareSemanticMemory(envelope([{...s,evidence:{source:'history',quote:'这是我养的狗'}}],[],null),msg,pets,A,[{role:'assistant',content:'这是我养的狗'}]));
 const no=JSON.parse(envelope([s],[weight('new_a',msg,5)],'new_a'));no.consent='declined';assert.equal(prepareSemanticMemory(JSON.stringify(no),msg,pets,A).operations.length,0);
});
test('multiple new subjects retain separate aliases; ambiguity produces a clarification gap',()=>{
 const msg='我照顾这两个新伙伴，一只5公斤，另一只3公斤';const p=prepareSemanticMemory(envelope([subject('new_a','new',msg),subject('new_b','new',msg)],[weight('new_a',msg,5),weight('new_b',msg,3)],null),msg,pets,A);assert.deepEqual(p.operations.map(o=>o.pet),['@new:new_a','@new:new_b']);assert.equal(p.focus_ref,null);
 const unclear=prepareSemanticMemory(envelope([subject('unknown','unresolved',msg,{certainty:'uncertain',relation:'unknown'})],[],null),msg,pets,A);assert.ok(unclear.state.missing.length);
});

test('semantic validation permits explicit unusual names, normalized dates and real plans without phrase tests',()=>{
 const named='我给新来的小家伙取的名字是泰迪';let p=prepareSemanticMemory(envelope([subject('new_a','new',named,{name:'泰迪'})],[{type:'fact',pet:'new_a',field:'name',value:'泰迪',quote:named}],'new_a'),named,pets,A);assert.equal(p.operations[0].value,'泰迪');
 const birth='它出生在二〇二四年五月';p=prepareSemanticMemory(envelope([subject(A,'existing',birth)],[{type:'fact',pet:A,field:'birth_date',value:'2024-05',quote:birth}],A),birth,pets,A);assert.equal(p.operations[0].value,'2024-05');
 const plan='周三的宠物就诊预约安排好了';p=prepareSemanticMemory(envelope([subject(A,'existing',plan)],[{type:'record',pet:A,category:'care_plan',event_status:'planned',description:'周三就诊预约',quote:plan,date_text:'周三'}],A),plan,pets,A);assert.equal(p.operations[0].category,'care_plan');
});
