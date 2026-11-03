import test from 'node:test';import assert from 'node:assert/strict';
import {memoryFailureDetails} from '../src/memory-diagnostics.js';import {DB} from '../src/db.js';
test('memory diagnostics show stage and safe codes without raw user/model/database data',()=>{
 const e={code:'DATABASE_ERROR',database_code:'42703',message:'secret user text',issues:[{path:'operations[0].quote',code:'USER_QUOTE_REQUIRED',expected:'user message secret'}],raw:'secret'};
 const d=memoryFailureDetails(e,'database_apply','11111111-1111-4111-8111-111111111111');assert.equal(d.stage,'database_apply');assert.equal(d.database_code,'42703');assert.equal(d.issues[0].code,'USER_QUOTE_REQUIRED');assert.ok(!JSON.stringify(d).includes('secret'));
 assert.equal(memoryFailureDetails(Error('raw model with spaces'),'extract_validate','id').code,'Error');
});
test('database exceptions retain SQL error code internally without exposing server details in message',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async()=>Response.json({code:'42703',message:'secret column details'},{status:400});try{await assert.rejects(new DB({SUPABASE_URL:'https://db.invalid',SUPABASE_SECRET_KEY:'sb_secret_test'}).rpc('petai_apply_memory',{}),e=>e.code==='SCHEMA_NOT_READY'&&e.database_code==='42703'&&!e.message.includes('secret'))}finally{globalThis.fetch=previous}
});
