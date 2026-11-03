import test from 'node:test';import assert from 'node:assert/strict';import {route} from '../src/index.js';
const U='11111111-1111-4111-8111-111111111111',P='22222222-2222-4222-8222-222222222222',T='33333333-3333-4333-8333-333333333333';
test('answer and history reads never depend on optional archive queries; missing migration only affects annotations',async()=>{
 const previous=globalThis.fetch,raw=' **FastGPT原文**\r\n尾部空白 \t\n';let reads=0,missing=false;
 globalThis.fetch=async url=>{const u=new URL(url),p=u.pathname;if(p==='/auth/v1/user')return Response.json({id:U});assert.equal(u.searchParams.get('owner_id'),'eq.'+U);
 if(p.endsWith('/chat_turns'))return Response.json([{id:T,status:'completed',answer:raw,lease_token:'private',context_snapshot:{private:true}}]);
 if(p.endsWith('/conversations'))return Response.json([{id:T,owner_id:U}]);
 if(p.endsWith('/messages'))return Response.json(u.searchParams.has('role')?[{id:U,turn_id:T}]:[{role:'assistant',status:'complete',turn_id:T,content:raw}]);
 if(p.endsWith('/pets')){reads++;assert.equal(u.searchParams.get('created_from_turn_id'),'in.('+T+')');return Response.json([{id:P,owner_id:U,name:'未命名宠物',ownership_confirmed:true,created_from_turn_id:T}])}
 if(p.endsWith('/archive_change_receipts'))throw Error('must not query receipt table');
 if(p.endsWith('/pet_records'))return missing?Response.json({code:'PGRST205',message:'not found'},{status:404}):Response.json([]);
 if(p.endsWith('/memory_issues'))return Response.json([]);
 if(p.endsWith('/pet_facts'))return Response.json([{pet_id:P,field:'species',value:'狗',quote:'我有一只柯基'}]);if(p.endsWith('/pet_manual_fields'))return Response.json([]);throw Error(p)};
 try{const env={SUPABASE_URL:'https://db.invalid',SUPABASE_SECRET_KEY:'sb_secret_test',API_RATE_LIMITER:{limit:async()=>({success:true})}},req=path=>new Request('https://pet.invalid/api/'+path,{headers:{authorization:'Bearer test'}});
 let body=await(await route(req('turns/'+T),env,{})).json();assert.equal(body.answer,raw);assert.equal(body.context_snapshot,undefined);assert.equal(body.lease_token,undefined);assert.equal(reads,0);
 body=await(await route(req('archive-notices?turn_ids='+T),env,{})).json();assert.equal(body[0].created_pets[0].id,P);assert.equal(reads,1);
 missing=true;await assert.rejects(route(req('archive-notices?turn_ids='+T),env,{}),e=>e.code==='SCHEMA_NOT_READY');body=await(await route(req('turns/'+T),env,{})).json();assert.equal(body.answer,raw);
 const history=await(await route(req('conversations/'+T+'/messages'),env,{})).json();assert.equal(history[0].content,raw);
 }finally{globalThis.fetch=previous}
});

test('missing creation column and absent receipt table do not suppress persisted update notices',async()=>{
 const previous=globalThis.fetch,M='44444444-4444-4444-8444-444444444444';globalThis.fetch=async url=>{const u=new URL(url),p=u.pathname;
 if(p==='/auth/v1/user')return Response.json({id:U});assert.equal(u.searchParams.get('owner_id'),'eq.'+U);
 if(p.endsWith('/chat_turns'))return Response.json([{id:T,memory_done:true,memory_status:'saved'}]);
 if(p.endsWith('/messages'))return Response.json([{id:M,turn_id:T}]);
 if(p.endsWith('/pets'))return u.searchParams.has('created_from_turn_id')?Response.json({code:'PGRST204',message:'column unavailable'},{status:400}):Response.json([{id:P,name:'茄茄',ownership_confirmed:true,name_confirmed:true}]);
 if(p.endsWith('/pet_records'))return Response.json([{pet_id:P,category:'weight',source_message_id:M}]);
 if(p.endsWith('/pet_facts'))return Response.json(u.searchParams.has('source_message_id')?[]:[{pet_id:P,field:'species',value:'狗',quote:'我家有一只狗'}]);
 if(p.endsWith('/pet_manual_fields')||p.endsWith('/memory_issues'))return Response.json([]);
 if(p.endsWith('/archive_change_receipts'))throw Error('receipt table must not be queried');throw Error(p)};
 try{const env={SUPABASE_URL:'https://db.invalid',SUPABASE_SECRET_KEY:'sb_secret_test',API_RATE_LIMITER:{limit:async()=>({success:true})}};const r=await route(new Request('https://pet.invalid/api/archive-notices?turn_ids='+T,{headers:{authorization:'Bearer test'}}),env,{}),b=await r.json();assert.equal(r.status,200);assert.deepEqual(b[0].created_pets,[]);assert.deepEqual(b[0].archive_changes[0].updated_fields,['weight_kg']);assert.equal(b[0].memory_pending,false);
 }finally{globalThis.fetch=previous}
});
