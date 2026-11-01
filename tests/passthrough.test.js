import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fastgpt} from '../src/core.js';
import worker from '../src/index.js';
const env={FASTGPT_API_URL:'https://school.invalid/chat',FASTGPT_API_KEY:'test-only',MEMORY_API_URL:'https://school.invalid/memory',MEMORY_API_KEY:'memory-test-only'};
const message=[{role:'user',content:'广州养狗需要登记吗'}];
const raw='  FastGPT原始答案。\r\n\r\n**原始标题**\n1. 条目\n\n[来源](https://example.org/path_(1)?a=1&b=2)\n\t尾部空白  \n';
async function mocked(payload,fn){const prev=globalThis.fetch;const requests=[];globalThis.fetch=async(url,init)=>{requests.push({url,...JSON.parse(init.body)});return Response.json(payload)};try{await fn(requests)}finally{globalThis.fetch=prev}}
test('main reply is character-for-character upstream content including whitespace, Markdown and URLs',async()=>{
 await mocked({choices:[{message:{content:raw}}]},async(reqs)=>{
  assert.equal(await fastgpt(env,message,{lawIntent:'yes'}),raw);
  assert.equal(reqs[0].detail,false);assert.equal('max_tokens' in reqs[0],false);
 });
});
test('missing, malformed or negative detail traces cannot change the answer',async()=>{
 for(const responseData of [undefined,[null],{bad:'shape'},[{nodeId:'petcareLegalScopeV19',textOutput:'{"ready":false}'},{nodeId:'petcareWebEvidenceV19',textOutput:'{"status":"INSUFFICIENT"}'}]]){
  await mocked({choices:[{message:{content:raw}}],responseData},async()=>assert.equal(await fastgpt({...env,LEGAL_AUDIT_LOG:'true'},message,{lawIntent:'yes'}),raw));
 }
});
test('long answer beyond 24000 characters is not sliced',async()=>{
 const long='开头\n'+'猫🐾'.repeat(10000)+'\n必须完整保留的末尾';
 await mocked({choices:[{message:{content:long}}]},async()=>assert.equal(await fastgpt(env,message,{lawIntent:'yes'}),long));
});
test('memory remains a separate model request, with the original JSON string retained',async()=>{
 const json=' \n{"operations":[],"state":{}}\n';
 await mocked({choices:[{message:{content:json}}]},async(reqs)=>{assert.equal(await fastgpt(env,message,{},true),json);assert.equal(reqs[0].url,env.MEMORY_API_URL);assert.equal(reqs[0].max_tokens,2500)});
});
test('empty/unsupported responses are errors rather than invented fallback answers',async()=>{
 for(const content of ['',null,' \n\t',[],{text:'unsupported'}])await mocked({choices:[{message:{content}}]},async()=>assert.rejects(fastgpt(env,message),/UPSTREAM_EMPTY/));
 await mocked({error:{message:'fixture'}},async()=>assert.rejects(fastgpt(env,message),/UPSTREAM_EMPTY/));
});
test('upstream HTTP errors propagate as errors with no generated reply',async()=>{
 const prev=globalThis.fetch;globalThis.fetch=async()=>new Response('failure',{status:503});
 try{await assert.rejects(fastgpt(env,message),/UPSTREAM_HTTP_503/)}finally{globalThis.fetch=prev}
});
test('guest HTTP response relays the same raw content, including for law intent',async()=>{
 const prev=globalThis.fetch;
 globalThis.fetch=async(url)=>url.includes('turnstile')?Response.json({success:true,hostname:'pet.example',action:'guest_chat'}):Response.json({choices:[{message:{content:raw}}]});
 try{
  const config={...env,GUEST_ENABLED:'true',TURNSTILE_SECRET_KEY:'fixture',TURNSTILE_HOSTNAMES:'pet.example',ALLOWED_ORIGINS:'https://pet.example',API_RATE_LIMITER:{limit:async()=>({success:true})}};
  const res=await worker.fetch(new Request('https://api/api/guest/chat',{method:'POST',headers:{Origin:'https://pet.example','Content-Type':'application/json'},body:JSON.stringify({text:message[0].content,turnstile_token:'fixture'})}),config,{});
  assert.equal(res.status,200);assert.equal((await res.json()).answer,raw);
 }finally{globalThis.fetch=prev}
});
test('authenticated turn polling returns stored raw answer without exposing internal snapshot',async()=>{
 const uid='11111111-1111-4111-8111-111111111111',tid='22222222-2222-4222-8222-222222222222';
 const prev=globalThis.fetch;globalThis.fetch=async(url)=>url.endsWith('/auth/v1/user')?Response.json({id:uid}):Response.json([{id:tid,owner_id:uid,status:'completed',answer:raw,context_snapshot:{private:'snapshot'},lease_token:'private-lease'}]);
 try{
  const res=await worker.fetch(new Request('https://api/api/turns/'+tid,{headers:{Authorization:'Bearer fixture'}}),{SUPABASE_URL:'https://db.invalid',SUPABASE_SECRET_KEY:'sb_secret_fixture',API_RATE_LIMITER:{limit:async()=>({success:true})}},{});
  const data=await res.json();assert.equal(res.status,200);assert.equal(data.answer,raw);assert.equal(data.context_snapshot,undefined);assert.equal(data.lease_token,undefined);
 }finally{globalThis.fetch=prev}
});
test('active answer path has no evidence hook or answer truncation',()=>{
 const code=readFileSync(new URL('../src/core.js',import.meta.url),'utf8');assert.ok(!code.includes('auditLegalAnswer'));assert.ok(!code.includes('answer.slice'));
});
