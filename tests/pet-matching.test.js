import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePetMatch,preparePetMemory,memoryPetFromSnapshot} from '../src/pet-matching.js';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const pets=[{id:A,name:'豆豆'},{id:B,name:'团团'}];
test('matching follows explicit names across conversations and pet switches',()=>{
 assert.equal(resolvePetMatch(pets,'豆豆多大了').id,A);assert.equal(resolvePetMatch(pets,'团团要驱虫吗',A).id,B);
 assert.equal(resolvePetMatch(pets,'不是豆豆，是团团',A).id,B);assert.equal(resolvePetMatch(pets,'豆豆好了，现在问团团',A).id,B);
 assert.equal(resolvePetMatch(pets,'它最近4公斤',A).id,A);
});
test('ambiguous individuals, new animals and category placeholders are not guessed',()=>{
 for(const text of ['豆豆和团团需要驱虫吗','我朋友的豆豆吐了','我朋友养的豆豆吐了','我的朋友的豆豆吐了','另一只猫呢'])assert.equal(resolvePetMatch(pets,text,A).id,null);
 assert.equal(resolvePetMatch(pets,'我家球球今天吐了',A).id,null);
 assert.equal(resolvePetMatch([{id:A,name:'猫'}],'猫多大了',A).id,null);
 assert.equal(resolvePetMatch([pets[0]],'它多大了').id,null);
 assert.equal(resolvePetMatch(pets,'我家狗需要驱虫吗',A,{species:'猫'}).id,null);
 assert.equal(resolvePetMatch(pets,'广州养狗需要登记吗',A,{species:'猫'}).id,null);
 assert.equal(resolvePetMatch([{id:A,name:'Milo'}],'Camilo怎么样').id,null);
});
test('memory creation needs ownership; a name supplied in a followup can use owner context',()=>{
 const extract=JSON.stringify({operations:[{type:'fact',pet:'球球',field:'name',value:'球球',quote:'球球'}]});
 assert.equal(preparePetMemory(extract,'球球是猫',[],null).operations.length,0);
 assert.equal(preparePetMemory(extract,'我家的猫名字叫球球',[],null).operations.length,1);
 assert.equal(preparePetMemory(extract,'它叫球球',[],null,true,[{role:'user',content:'我养了一只猫'}]).operations.length,1);
 assert.equal(preparePetMemory(extract,'球球',[],null,true,[{role:'user',content:'我有一只猫'},{role:'assistant',content:'它叫什么名字？'}]).operations.length,1);
 assert.equal(preparePetMemory(extract,'我朋友的球球是猫',[],null).operations.length,0);
 const legacy=JSON.stringify({operations:[{type:'fact',pet:A,field:'species',value:'猫',quote:'猫'}]});assert.equal(preparePetMemory(legacy,'帮我看看图片里的猫，是什么品种？',[{id:A,name:'猫'}],null).operations.length,0);
 const out=preparePetMemory('{"operations":[]}','豆豆和团团',pets,null,false);assert.equal(out.current_pet,null);assert.equal(out.allow_binding,false);
});
test('late memory retries use the original snapshot including explicit no-match',()=>{
 assert.equal(memoryPetFromSnapshot({memory_pet_id:A}),A);assert.equal(memoryPetFromSnapshot({memory_pet_id:null,variables:{petProfile:JSON.stringify({id:B})}}),null);
 assert.equal(memoryPetFromSnapshot({variables:{petProfile:JSON.stringify({id:A})}}),A);assert.equal(memoryPetFromSnapshot(null),null);
});

test('real turn runner uses the switched target and preserves upstream answer verbatim',async()=>{
 const {runTurn}=await import('../src/jobs.js');
 for(const [text,target]of [['团团需要驱虫吗',B],['豆豆和团团需要驱虫吗',null]]){
  const previous=globalThis.fetch,owner='33333333-3333-4333-8333-333333333333',turn='44444444-4444-4444-8444-444444444444',lease='55555555-5555-4555-8555-555555555555';
  const conv={id:'66666666-6666-4666-8666-666666666666',pet_id:A};let snapshot,completed,fail;
  const raw='  **FastGPT原文**\r\n保留尾部空白 \t\n';
  globalThis.fetch=async(url,init={})=>{
   const u=new URL(url),path=u.pathname,b=init.body?JSON.parse(init.body):{};
   if(u.hostname==='school.invalid')return Response.json({choices:[{message:{content:raw}}]});
   if(path.endsWith('/rpc/petai_claim_turn'))return Response.json({owner_id:owner,conversation_id:conv.id,lease_token:lease,memory_done:true});
   if(path.endsWith('/rpc/petai_set_turn_pet')){assert.equal(b.p_pet,target);conv.pet_id=b.p_pet;return Response.json(null)}
   if(path.endsWith('/rpc/petai_start_answer')){snapshot=b.p_context;return Response.json(true)}
   if(path.endsWith('/rpc/petai_complete_turn')){completed=b.p_answer;return Response.json(null)}
   if(path.endsWith('/rpc/petai_fail_turn')){fail=b;return Response.json(null)}
   if(path.endsWith('/conversations'))return Response.json([conv]);
   if(path.endsWith('/messages'))return Response.json(u.searchParams.get('turn_id')?[{content:text,sequence:3}]:[]);
   if(path.endsWith('/pets'))return Response.json(u.searchParams.has('id')?pets.filter(p=>'eq.'+p.id===u.searchParams.get('id')):pets);
   if(['/pet_facts','/pet_records','/memory_issues','/conversation_states'].some(p=>path.endsWith(p)))return Response.json([]);
   throw Error('Unexpected turn route '+path);
  };
  try{
   await runTurn({SUPABASE_URL:'https://db.invalid',SUPABASE_SECRET_KEY:'sb_secret_test',FASTGPT_API_URL:'https://school.invalid/chat',FASTGPT_API_KEY:'test'},turn);
   assert.equal(fail,undefined);assert.equal(completed,raw);assert.equal(snapshot.memory_pet_id,target);
   assert.equal(snapshot.variables.petProfile?JSON.parse(snapshot.variables.petProfile).id:null,target);
  }finally{globalThis.fetch=previous}
 }
});

test('browser cannot pick an identity by injecting pet_id into create-conversation',async()=>{
 const worker=(await import('../src/index.js')).default;const original=globalThis.fetch;
 globalThis.fetch=async(url)=>{assert.ok(url.endsWith('/auth/v1/user'));return Response.json({id:A})};
 try{const res=await worker.fetch(new Request('https://api.invalid/api/conversations',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify({pet_id:B})}),{SUPABASE_URL:'https://db.invalid',SUPABASE_SECRET_KEY:'sb_secret_fixture',API_RATE_LIMITER:{limit:async()=>({success:true})}},{});assert.equal(res.status,400);assert.equal((await res.json()).error.code,'READ_ONLY')}finally{globalThis.fetch=original}
});
