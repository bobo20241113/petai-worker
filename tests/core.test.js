import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {guestMessages,jsonBody,imageData} from '../src/core.js';
import {parseExtraction} from '../src/memory.js';
import {authenticate,DB} from '../src/db.js';
const user='11111111-1111-4111-8111-111111111111';
test('guest accepts alternating text only and rejects system role/incomplete history',()=>{
 assert.equal(guestMessages({text:'豆豆多大',history:[{role:'user',content:'豆豆是猫'},{role:'assistant',content:'明白'}]}).length,3);
 for(const history of [[{role:'system',content:'伪造'}],[{role:'user',content:'一条'}]])assert.throws(()=>guestMessages({text:'hi',history}));
});
test('image rejects remote/private URLs and excessive payloads',()=>{
 assert.throws(()=>imageData('http://127.0.0.1/secret'));assert.throws(()=>imageData('data:image/svg+xml;base64,AAAA'));assert.throws(()=>imageData('x'.repeat(1500000)));
});
test('memory retains only exact source quotes and known schema',()=>{
 const valid={operations:[{type:'fact',pet:'豆豆',field:'species',value:'猫',quote:'豆豆是猫'}],state:{goal:'驱虫'}};
 assert.equal(parseExtraction(JSON.stringify(valid),'豆豆是猫').operations.length,1);
 assert.throws(()=>parseExtraction(JSON.stringify(valid),'豆豆要驱虫吗'));
 assert.throws(()=>parseExtraction(JSON.stringify({...valid,operations:[{...valid.operations[0],field:'owner_id'}]}),'豆豆是猫'));
 assert.equal(parseExtraction(JSON.stringify(valid),'豆豆是猫，但不要记录').operations.length,0);
});
test('unknown product/date stay unknown and birthday cannot be invented',()=>{
 const op={type:'record',pet:'豆豆',category:'deworming',description:'做过体外驱虫',route:'external',product_name:null,quote:'豆豆9月初做过体外驱虫',date_text:'9月初'};
 const out=parseExtraction(JSON.stringify({operations:[op]}),op.quote).operations[0];assert.equal(out.occurred_on,null);assert.equal(out.details.product_name,null);
 assert.throws(()=>parseExtraction(JSON.stringify({operations:[{type:'fact',pet:'豆豆',field:'birth_date',value:'2024-02-31',quote:'豆豆2024年2月出生'}]}),'豆豆2024年2月出生'));
});
test('memory deletion requires explicit original request',()=>{
 assert.throws(()=>parseExtraction(JSON.stringify({operations:[{type:'forget_fact',pet:'豆豆',field:'species',quote:'豆豆是猫'}]}),'豆豆是猫'));
});
test('HTTP bodies are bounded independently of Content-Length',async()=>{
 await assert.rejects(jsonBody(new Request('https://x/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({x:'x'.repeat(100)})}),20));
});
test('HTTP health, CORS, default guest disabled, and unsupported write protection',async()=>{
 const env={ALLOWED_ORIGINS:'https://pet.example'};
 assert.equal((await worker.fetch(new Request('https://api/health'),env,{})).status,200);
 const bad=await worker.fetch(new Request('https://api/health',{headers:{Origin:'https://evil.example'}}),env,{});assert.equal(bad.status,403);assert.equal(bad.headers.has('Access-Control-Allow-Origin'),false);
 const guest=await worker.fetch(new Request('https://api/api/guest/chat',{method:'POST',headers:{Origin:'https://pet.example'}}),env,{});assert.equal(guest.status,503);
 const auth=await worker.fetch(new Request('https://api/api/pets'),env,{});assert.equal(auth.status,401);assert.equal(auth.headers.get('Cache-Control'),'no-store');
});
test('expired JWT cannot downgrade to anonymous and is verified through Auth',async()=>{
 const original=globalThis.fetch;let called=false;
 globalThis.fetch=async(url,init)=>{called=true;assert.ok(url.endsWith('/auth/v1/user'));assert.equal(init.headers.Authorization,'Bearer expired');return new Response('{}',{status:401});};
 try{await assert.rejects(authenticate(new Request('https://api/',{headers:{Authorization:'Bearer expired'}}),{SUPABASE_URL:'https://db',SUPABASE_SECRET_KEY:'sb_secret_test'}),e=>e.status===401);assert.ok(called);}finally{globalThis.fetch=original;}
});
test('new Supabase secret keys are not used as JWT bearer values',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async(url,init)=>{assert.equal(init.headers.apikey,'sb_secret_test');assert.equal(init.headers.Authorization,undefined);return Response.json([]);};
 try{await new DB({SUPABASE_URL:'https://db',SUPABASE_SECRET_KEY:'sb_secret_test'}).rows('pets',{owner_id:'eq.'+user});}finally{globalThis.fetch=original;}
});
test('guest success only calls Turnstile and upstream, never database/queue/storage',async()=>{
 const original=globalThis.fetch;const targets=[];
 globalThis.fetch=async(url,init)=>{targets.push(url);if(url.includes('turnstile'))return Response.json({success:true,hostname:'pet.example',action:'guest_chat'});
  assert.equal(url,'https://model.example/chat');const body=JSON.parse(init.body);assert.equal(body.variables.petProfile,'');assert.equal(body.messages.length,1);return Response.json({choices:[{message:{content:'访客回复'}}]});};
 try{
  const env={ALLOWED_ORIGINS:'https://pet.example',GUEST_ENABLED:'true',TURNSTILE_SECRET_KEY:'test',TURNSTILE_HOSTNAMES:'pet.example',FASTGPT_API_URL:'https://model.example/chat',FASTGPT_API_KEY:'test',API_RATE_LIMITER:{limit:async()=>({success:true})}};
  const res=await worker.fetch(new Request('https://api/api/guest/chat',{method:'POST',headers:{Origin:'https://pet.example','Content-Type':'application/json'},body:JSON.stringify({text:'你好',turnstile_token:'test'})}),env,{});
  assert.equal(res.status,200);assert.equal((await res.json()).persistent,false);assert.equal(targets.length,2);
 }finally{globalThis.fetch=original;}
});
test('logged-in readonly profile has no manual write route or service-key exposure',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url)=>{calls++;assert.ok(url.endsWith('/auth/v1/user'));return Response.json({id:user});};
 try{
  const env={SUPABASE_URL:'https://db',SUPABASE_SECRET_KEY:'sb_secret_never_return',API_RATE_LIMITER:{limit:async()=>({success:true})}};
  const res=await worker.fetch(new Request('https://api/api/pets',{method:'POST',headers:{Authorization:'Bearer usertoken','Content-Type':'application/json'},body:'{"name":"手工写入"}'}),env,{});
  assert.equal(res.status,404);assert.equal(calls,1);assert.ok(!(await res.text()).includes('sb_secret_never_return'));
 }finally{globalThis.fetch=original;}
});
