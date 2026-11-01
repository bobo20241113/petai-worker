import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {issueGuestSession,verifyGuestSession,GUEST_SESSION_SECONDS} from '../src/guest-session.js';
const origin='https://pet.example';
const env={GUEST_ENABLED:'true',TURNSTILE_SECRET_KEY:'turnstile-fixture',TURNSTILE_HOSTNAMES:'pet.example',ALLOWED_ORIGINS:origin,FASTGPT_API_URL:'https://model.invalid/chat',FASTGPT_API_KEY:'model-fixture',API_RATE_LIMITER:{limit:async()=>({success:true})}};
const post=(path,body,headers={})=>new Request('https://api.invalid'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
test('signed visitor pass lasts 30 minutes, is origin-bound and has no sliding extension',async()=>{
 const now=Date.now(),session=await issueGuestSession(env,origin,now);
 assert.equal(GUEST_SESSION_SECONDS,1800);assert.ok(!session.guest_session_token.includes(env.TURNSTILE_SECRET_KEY));
 const claims=await verifyGuestSession(env,origin,session.guest_session_token,now+1798*1000);
 assert.equal(claims.exp-claims.iat,1800);
 await assert.rejects(verifyGuestSession(env,origin,session.guest_session_token,now+1801*1000),e=>e.code==='GUEST_SESSION_EXPIRED');
 await assert.rejects(verifyGuestSession(env,'https://other.example',session.guest_session_token),e=>e.code==='GUEST_SESSION_INVALID');
});
test('tampered, oversized, wrong-key and malformed passes are rejected',async()=>{
 const session=await issueGuestSession(env,origin);const [body,signature]=session.guest_session_token.split('.');
 const altered=JSON.parse(Buffer.from(body,'base64url').toString());altered.exp+=3600;
 for(const token of ['',null,'x'.repeat(2100),body+'.'+signature.slice(1),Buffer.from(JSON.stringify(altered)).toString('base64url')+'.'+signature]){
  await assert.rejects(verifyGuestSession(env,origin,token),e=>e.code==='GUEST_SESSION_INVALID');
 }
 await assert.rejects(verifyGuestSession({...env,GUEST_SESSION_SECRET:'different-key'},origin,session.guest_session_token),e=>e.code==='GUEST_SESSION_INVALID');
});
test('one Turnstile exchange authorizes multiple raw chats without database or token revalidation',async()=>{
 const previous=globalThis.fetch;const targets=[];const raw='  FastGPT 原文\n\n[来源](https://example.org/a)  \n';
 globalThis.fetch=async(url,init)=>{targets.push(url);if(url.includes('siteverify'))return Response.json({success:true,hostname:'pet.example',action:'guest_chat'});assert.equal(url,env.FASTGPT_API_URL);return Response.json({choices:[{message:{content:raw}}]})};
 try{
  const issued=await worker.fetch(post('/api/guest/session',{turnstile_token:'challenge'}),env,{});assert.equal(issued.status,200);
  const session=await issued.json();assert.ok(session.guest_session_token);assert.equal(session.TURNSTILE_SECRET_KEY,undefined);
  for(let i=0;i<2;i++){
   const res=await worker.fetch(post('/api/guest/chat',{text:'你好',guest_session_token:session.guest_session_token}),env,{});
   assert.equal(res.status,200);const data=await res.json();assert.equal(data.answer,raw);assert.equal(data.persistent,false);assert.equal(data.guest_session_token,undefined);
  }
  assert.equal(targets.filter(x=>x.includes('siteverify')).length,1);assert.equal(targets.length,3);
 }finally{globalThis.fetch=previous}
});
test('failed challenge never issues a pass; wrong hostname/action and unavailable verification fail closed',async()=>{
 const prev=globalThis.fetch;
 try{
  for(const result of [{success:false},{success:true,hostname:'wrong.example',action:'guest_chat'},{success:true,hostname:'pet.example',action:'wrong'}]){
   globalThis.fetch=async()=>Response.json(result);
   const res=await worker.fetch(post('/api/guest/session',{turnstile_token:'challenge'}),env,{});assert.equal(res.status,403);assert.equal((await res.json()).guest_session_token,undefined);
  }
  globalThis.fetch=async()=>{throw Error('offline')};const res=await worker.fetch(post('/api/guest/session',{turnstile_token:'challenge'}),env,{});assert.equal(res.status,502);
 }finally{globalThis.fetch=prev}
});
test('expired pass is rejected before upstream, even if a challenge token is also supplied',async()=>{
 const session=await issueGuestSession(env,origin,Date.now()-1801000);const prev=globalThis.fetch;
 globalThis.fetch=async()=>{throw Error('must not call upstream')};
 try{
  const res=await worker.fetch(post('/api/guest/chat',{text:'你好',guest_session_token:session.guest_session_token,turnstile_token:'other'}),env,{});
  assert.equal(res.status,403);assert.equal((await res.json()).error.code,'GUEST_SESSION_EXPIRED');
 }finally{globalThis.fetch=prev}
});
test('guest exchange retains disabled, authenticated, origin, rate and secret checks',async()=>{
 const cases=[
  [{...env,GUEST_ENABLED:'false'},{},503],
  [env,{Authorization:'Bearer authenticated'},400],
  [env,{Origin:'https://evil.example'},403],
  [{...env,API_RATE_LIMITER:{limit:async()=>({success:false})}},{},429],
  [{...env,TURNSTILE_SECRET_KEY:''},{},503]
 ];
 for(const [settings,headers,status] of cases){const res=await worker.fetch(post('/api/guest/session',{turnstile_token:'challenge'},headers),settings,{});assert.equal(res.status,status)}
});

test('page-scope pass has no time expiry but remains origin-bound and revocable by secret rotation',async()=>{
 const now=Date.now(),session=await issueGuestSession(env,origin,now,true);
 assert.equal(session.session_scope,'page');assert.equal(session.expires_at,undefined);
 const claims=await verifyGuestSession(env,origin,session.guest_session_token,now+7*24*3600*1000);
 assert.equal(claims.v,2);assert.equal(claims.exp,undefined);
 await assert.rejects(verifyGuestSession(env,'https://else.example',session.guest_session_token),e=>e.code==='GUEST_SESSION_INVALID');
 await assert.rejects(verifyGuestSession({...env,GUEST_SESSION_SECRET:'rotated'},origin,session.guest_session_token),e=>e.code==='GUEST_SESSION_INVALID');
});
test('new pages opt into page-scope exchange while old pages retain their original short-lived protocol',async()=>{
 const prev=globalThis.fetch;globalThis.fetch=async()=>Response.json({success:true,hostname:'pet.example',action:'guest_chat'});
 try{
  const fresh=await worker.fetch(post('/api/guest/session',{turnstile_token:'challenge',session_version:2}),env,{});
  assert.equal(fresh.status,200);assert.equal((await fresh.json()).session_scope,'page');
  const legacy=await worker.fetch(post('/api/guest/session',{turnstile_token:'challenge'}),env,{});
  assert.ok((await legacy.json()).expires_at);
 }finally{globalThis.fetch=prev}
});
