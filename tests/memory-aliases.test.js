import test from 'node:test';import assert from 'node:assert/strict';
import {prepareSemanticMemory,canonicalMemoryEnvelope} from '../src/semantic-memory.js';
const A='11111111-1111-4111-8111-111111111111',message='我还有一只泰迪, 6kg 是否太轻了?';
const subject={ref:'new_a',identity:'new',relation:'owned',certainty:'certain',name:null,evidence:{source:'current',quote:'我还有一只泰迪'}};
const raw={schema_version:2,consent:'allowed',subjects:[subject],focus_ref:'new_a',operations:[{type:'new_fact',pet:'new_a',field:'species',value:'狗',quote:'我还有一只泰迪',correction:false},{type:'new_fact',pet:'new_a',field:'breed_description',value:'泰迪',quote:'我还有一只泰迪',correction:false},{type:'new_record',pet:'new_a',category:'weight',event_status:'completed',description:'6kg',quote:message,date_text:null,kg:6,route:'unknown',product_name:null}],state:{}};
const pets=[{id:A,name:'茄茄',species:'狗'}],parse=(r,msg=message)=>prepareSemanticMemory(JSON.stringify(r),msg,pets,A);
test('actual school new_fact/new_record wire types are canonicalized without changing source or meaning',()=>{
 const p=parse(raw);assert.deepEqual(p.operations.map(o=>o.type),['fact','fact','record']);assert.ok(p.operations.every(o=>o.pet==='@new:new_a'));assert.equal(p.operations[1].value,'泰迪');assert.equal(p.operations[2].details.kg,6);assert.equal(raw.operations[0].type,'new_fact');assert.equal(canonicalMemoryEnvelope(raw).operations[2].quote,message);
});
test('wire aliases do not bypass ownership, evidence, types, numeric validation or account-scoped IDs',()=>{
 for(const relation of ['third_party','unknown']){const r={...raw,subjects:[{...subject,relation}]};assert.equal(parse(r).operations.length,0)}
 assert.throws(()=>parse(raw,'别人的狗'));assert.throws(()=>parse({...raw,operations:[{...raw.operations[0],value:'泰迪'}]}));assert.throws(()=>parse({...raw,operations:[{...raw.operations[2],kg:-6}]}));assert.throws(()=>parse({...raw,subjects:[{...subject,ref:'22222222-2222-4222-8222-222222222222',identity:'existing'}]}));
 for(const type of ['create_pet','new_forget_fact','__proto__','constructor'])assert.throws(()=>parse({...raw,operations:[{...raw.operations[0],type}]}));
});
test('existing subject stays existing despite a new_record operation alias',()=>{
 const r={...raw,subjects:[{...subject,ref:A,identity:'existing'}],focus_ref:A,operations:[{...raw.operations[2],pet:A}]};const p=parse(r);assert.equal(p.operations[0].pet,A);assert.equal(p.focus_ref,A);assert.equal(p.operations[0].details.kg,6);
});
