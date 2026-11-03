import test from 'node:test';import assert from 'node:assert/strict';import {route} from '../src/index.js';
const U='11111111-1111-4111-8111-111111111111',P='22222222-2222-4222-8222-222222222222',T='33333333-3333-4333-8333-333333333333';
test('creation receipts are queried by authenticated owner and originating turn, without modifying the answer',async()=>{
 const previous=globalThis.fetch,raw=' **FastGPT原文**\r\n尾部空白 \t\n';let reads=0,status='completed';
 globalThis.fetch=async url=>{const u=new URL(url),p=u.pathname;if(p==='/auth/v1/user')return Response.json({id:U});assert.equal(u.searchParams.get('owner_id'),'eq.'+U);
 if(p.endsWith('/chat_turns'))return Response.json([{id:T,status,answer:raw,lease_token:'private',context_snapshot:{private:true}}]);
 if(p.endsWith('/pets')){reads++;assert.equal(u.searchParams.get('created_from_turn_id'),'in.('+T+')');assert.equal(u.searchParams.get('ownership_confirmed'),'eq.true');return Response.json([{id:P,owner_id:U,name:'未命名宠物',ownership_confirmed:true,created_from_turn_id:T}])}
 if(p.endsWith('/archive_change_receipts'))return Response.json([]);
 if(p.endsWith('/pet_facts'))return Response.json([{pet_id:P,field:'species',value:'狗',quote:'我有一只柯基'}]);if(p.endsWith('/pet_manual_fields'))return Response.json([]);throw Error(p)};
 try{const env={SUPABASE_URL:'https://db.invalid',SUPABASE_SECRET_KEY:'sb_secret_test',API_RATE_LIMITER:{limit:async()=>({success:true})}},req=()=>new Request('https://pet.invalid/api/turns/'+T,{headers:{authorization:'Bearer test'}});
 let body=await (await route(req(),env,{})).json();assert.equal(body.answer,raw);assert.equal(body.created_pets[0].id,P);assert.equal(body.created_pets[0].created_from_turn_id,T);assert.equal(body.context_snapshot,undefined);assert.equal(body.lease_token,undefined);
 status='processing';body=await (await route(req(),env,{})).json();assert.deepEqual(body.created_pets,[]);assert.equal(reads,1);
 }finally{globalThis.fetch=previous}
});
