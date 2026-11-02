import test from 'node:test';import assert from 'node:assert/strict';import {summarizeTitle} from '../src/titles.js';
test('titles summarize topics without cutting raw user text or making another model call',()=>{
 assert.equal(summarizeTitle('广州养狗需要登记吗'),'广州 · 狗狗饲养规定');assert.match(summarizeTitle('猫的疫苗和驱虫。'+'其他细节'.repeat(1500)),/猫咪驱虫与疫苗/);assert.equal(summarizeTitle('你好'),'宠物问题咨询');assert.equal(summarizeTitle('',true),'宠物图片观察');assert.ok(summarizeTitle('短但未知的问题').length<30);
});
test('create conversation stores summarized title immediately and honors an explicit manual title',async()=>{
 const worker=(await import('../src/index.js')).default;const original=globalThis.fetch;let inserted;
 globalThis.fetch=async(url,init={})=>{if(url.endsWith('/auth/v1/user'))return Response.json({id:'11111111-1111-4111-8111-111111111111'});if(url.includes('/rest/v1/conversations')){inserted=JSON.parse(init.body);return Response.json([{id:'22222222-2222-4222-8222-222222222222',...inserted}])}throw Error('Unexpected '+url)};
 try{for(const body of [{first_message:'猫掉毛怎么办'},{first_message:'猫掉毛怎么办',title:'我的手动标题'}]){const res=await worker.fetch(new Request('https://api.invalid/api/conversations',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify(body)}),{SUPABASE_URL:'https://db.invalid',SUPABASE_SECRET_KEY:'sb_secret_test',API_RATE_LIMITER:{limit:async()=>({success:true})}},{});assert.equal(res.status,201);assert.equal(inserted.title,body.title||'猫咪毛发与皮肤');}}finally{globalThis.fetch=original}
});
