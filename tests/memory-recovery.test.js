import test from 'node:test';
import assert from 'node:assert/strict';
import {recover,syncMemory} from '../src/jobs.js';
const id='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222';
test('Cron silently schedules pending memory, retries queue delivery, and never calls main model',async()=>{
 const original=globalThis.fetch;let state='pending',marked=0,failQueue=true;const sent=[];
 globalThis.fetch=async(url,init={})=>{
  const u=new URL(url);assert.equal(u.origin,'https://db.invalid');const path=u.pathname;
  if(path==='/rest/v1/rpc/petai_recover')return Response.json(null);
  if(path==='/rest/v1/outbox'||path==='/rest/v1/storage_deletions')return Response.json([]);
  if(path==='/rest/v1/chat_turns'){
   if(u.searchParams.get('memory_status')==='eq.pending'){
    assert.equal(u.searchParams.get('status'),'eq.completed');assert.equal(u.searchParams.get('memory_done'),'eq.false');assert.equal(u.searchParams.get('memory_attempts'),'lt.3');
    assert.ok(Date.parse(u.searchParams.get('updated_at').slice(4))<=Date.now()-119000);
    return Response.json(state==='pending'?[{id,owner_id:owner}]:[]);
   }
   assert.equal(u.searchParams.get('memory_status'),'eq.retry_pending');return Response.json(state==='retry_pending'?[{id}]:[]);
  }
  if(path==='/rest/v1/rpc/petai_request_memory_retry'){
   assert.deepEqual(JSON.parse(init.body),{p_owner:owner,p_turn:id});marked++;state='retry_pending';return Response.json(null);
  }
  throw Error('unexpected '+path);
 };
 const env={SUPABASE_URL:'https://db.invalid',SUPABASE_SECRET_KEY:'sb_secret_fixture',MEMORY_API_URL:'https://memory.invalid/chat',MEMORY_API_KEY:'memory-fixture',CHAT_QUEUE:{send:async(body)=>{if(failQueue)throw Error('temporary queue outage');sent.push(body)}}};
 try{
  await recover(env);assert.equal(marked,1);assert.equal(state,'retry_pending');assert.equal(sent.length,0);
  failQueue=false;await recover(env);assert.equal(marked,1);assert.deepEqual(sent,[{turn_id:id,memory_only:true}]);
 }finally{globalThis.fetch=original}
});
test('duplicate memory delivery with no claim cannot rerun extraction or main answer',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async(url)=>{calls++;assert.ok(url.endsWith('/rpc/petai_claim_memory_retry'));return Response.json(null)};
 try{await syncMemory({SUPABASE_URL:'https://db.invalid',SUPABASE_SECRET_KEY:'sb_secret_fixture'},id);assert.equal(calls,1)}finally{globalThis.fetch=original}
});
test('missing extraction configuration does not consume automatic retry budget',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async(url)=>{const path=new URL(url).pathname;assert.ok(['/rest/v1/rpc/petai_recover','/rest/v1/outbox','/rest/v1/storage_deletions'].includes(path));return Response.json(path.endsWith('petai_recover')?null:[])};
 try{await recover({SUPABASE_URL:'https://db.invalid',SUPABASE_SECRET_KEY:'sb_secret_fixture',CHAT_QUEUE:{send:async()=>assert.fail('no memory queue without configuration')}})}finally{globalThis.fetch=original}
});
