import test from 'node:test';import assert from 'node:assert/strict';import {runTurn} from '../src/jobs.js';
const A='11111111-1111-4111-8111-111111111111',N='22222222-2222-4222-8222-222222222222',U='33333333-3333-4333-8333-333333333333',T='44444444-4444-4444-8444-444444444444',L='55555555-5555-4555-8555-555555555555',C='66666666-6666-4666-8666-666666666666';
test('actual queue runner follows semantic new-subject result; bad/legacy extraction stays pending instead of keyword fallback',async()=>{
 for(const mode of ['valid','legacy','repair','aliases']){const bad=mode==='legacy';let memoryCalls=0;const previous=globalThis.fetch,msg='家里另外那个小伙伴是泰迪，五公斤，算轻吗',conv={id:C,pet_id:A};let applied=false,pending=false,completed,profile;
 const output={schema_version:2,consent:'allowed',subjects:[{ref:'new_a',identity:'new',relation:'owned',certainty:'certain',name:null,evidence:{source:'current',quote:msg}}],focus_ref:'new_a',operations:[{type:'fact',pet:'new_a',field:'species',value:'狗',quote:msg},{type:'fact',pet:'new_a',field:'breed_description',value:'泰迪',quote:msg},{type:'record',pet:'new_a',category:'weight',event_status:'completed',kg:5,description:'用户提供的体重',quote:'五公斤'}],state:{}};
 const raw=' **FastGPT原文**\r\n保留原文 \t\n';
 globalThis.fetch=async(url,init={})=>{const u=new URL(url),p=u.pathname,b=init.body?JSON.parse(init.body):{};
 if(u.hostname==='memory.invalid'){memoryCalls++;const malformed={...output,operations:[{type:'fact',pet:'new_a',field:'species',value:'泰迪',quote:msg},{type:'fact',pet:'new_a',field:'weight',value:5,quote:msg}]};return Response.json({choices:[{message:{content:JSON.stringify(bad?{operations:[]}:mode==='repair'&&memoryCalls===1?malformed:mode==='aliases'?{...output,operations:output.operations.map(o=>({...o,type:o.type==='fact'?'new_fact':'new_record'}))}:output)}}]})}if(u.hostname==='school.invalid'){profile=b.variables.petProfile;return Response.json({choices:[{message:{content:raw}}]})}
 if(p.endsWith('/rpc/petai_claim_turn'))return Response.json({owner_id:U,conversation_id:C,lease_token:L,memory_done:false});
 if(p.endsWith('/rpc/petai_apply_memory')){assert.equal(b.p_data.schema_version,2);assert.ok(b.p_data.operations.every(o=>o.pet==='@new:new_a'));applied=true;conv.pet_id=N;return Response.json(null)}
 if(p.endsWith('/rpc/petai_set_turn_pet')){assert.equal(b.p_pet,null);conv.pet_id=null;return Response.json(null)}
 if(p.endsWith('/rpc/petai_memory_pending')){pending=true;return Response.json(null)}
 if(p.endsWith('/rpc/petai_start_answer'))return Response.json(true);if(p.endsWith('/rpc/petai_complete_turn')){completed=b.p_answer;return Response.json(null)}
 if(p.endsWith('/rpc/petai_fail_turn'))throw Error('should not fail main turn');
 if(p.endsWith('/conversations'))return Response.json([conv]);if(p.endsWith('/messages'))return Response.json(u.searchParams.has('turn_id')?[{content:msg,sequence:1}]:[]);
 if(p.endsWith('/pets'))return Response.json(u.searchParams.has('id')?[{id:u.searchParams.get('id').slice(3),name:'未命名宠物',ownership_confirmed:true}]:[{id:A,name:'茄茄',ownership_confirmed:true,name_confirmed:true},...(applied?[{id:N,name:'未命名宠物',ownership_confirmed:true}]:[])]);
 if(p.endsWith('/pet_facts'))return Response.json(u.searchParams.get('pet_id')==='eq.'+N?[{field:'species',value:'狗',quote:msg},{field:'breed_description',value:'泰迪',quote:msg}]:[]);
 if(p.endsWith('/pet_records'))return Response.json(u.searchParams.get('pet_id')==='eq.'+N?[{category:'weight',details:{kg:5}}]:[]);
 if(['/pet_manual_fields','/memory_issues','/conversation_states'].some(s=>p.endsWith(s)))return Response.json([]);throw Error(p)};
 try{await runTurn({SUPABASE_URL:'https://db.invalid',SUPABASE_SECRET_KEY:'sb_secret_test',FASTGPT_API_URL:'https://school.invalid/chat',FASTGPT_API_KEY:'main',MEMORY_API_URL:'https://memory.invalid/chat',MEMORY_API_KEY:'memory'},T);assert.equal(memoryCalls,mode==='repair'?2:1);assert.equal(completed,raw);assert.equal(applied,!bad);assert.equal(pending,bad);if(bad)assert.equal(profile,'');else{assert.equal(JSON.parse(profile).id,N);assert.equal(JSON.parse(profile).breed_description,'泰迪')}}finally{globalThis.fetch=previous}
 }
});
