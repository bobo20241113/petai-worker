import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile,readdir} from 'node:fs/promises';import {prepareSemanticMemory} from '../src/semantic-memory.js';
const base=new URL('../../petai-supabase/',import.meta.url),U='11111111-1111-4111-8111-111111111111',request='b3af63a3-1483-44d2-b4d4-5b11e9f0cabd';
test('old deployed writer rejects new aliases; 012 replacement and bounded one-turn memory recovery preserve answer and old pet',async()=>{
 const db=new PGlite(),one=async(q,p=[])=>(await db.query(q,p)).rows[0];try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to authenticated;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);insert into auth.users values('${U}');`);
 for(const f of (await readdir(new URL('migrations/',base))).filter(f=>f.endsWith('.sql')&&f<'012').sort())await db.exec((await readFile(new URL('migrations/'+f,base),'utf8')).replace('create extension if not exists pgcrypto;',''));
 const old=(await one("insert into pets(owner_id,name,ownership_confirmed,name_confirmed) values($1,'茄茄',true,true) returning id",[U])).id;
 await one("insert into pet_manual_fields(pet_id,owner_id,field,value) values($1,$2,'weight_kg','20')",[old,U]);
 const c=(await one('insert into conversations(owner_id,pet_id) values($1,$2) returning id',[U,old])).id,msg='我还有一只泰迪, 7kg 是否太轻了?',answer='主聊天回答原文\r\n 保留';
 const t=(await one('select petai_submit_turn($1,$2,$3,$4,null,$5,100) t',[U,c,request,msg,crypto.randomUUID()])).t;
 const lease=(await one('select petai_claim_turn($1) t',[t.id])).t.lease_token;
 const raw={schema_version:2,consent:'allowed',subjects:[{ref:'new_a',identity:'new',relation:'owned',certainty:'certain',name:null,evidence:{source:'current',quote:msg}}],focus_ref:'new_a',operations:[{type:'fact',pet:'new_a',field:'species',value:'狗',quote:msg,correction:false},{type:'record',pet:'new_a',category:'weight',event_status:'completed',description:'体重为7kg',quote:msg,date_text:null,kg:7,route:'unknown',product_name:null}],state:{}};
 const data=prepareSemanticMemory(JSON.stringify(raw),msg,[{id:old,name:'茄茄'}],old);
 await assert.rejects(one('select petai_apply_memory($1,$2,$3)',[t.id,lease,data]));assert.equal((await one('select count(*)::int n from pets')).n,1);
 await one('select petai_complete_turn($1,$2,$3)',[t.id,lease,answer]);await one("update chat_turns set memory_attempts=3,memory_status='pending',lease_until=now()-interval '1 hour' where id=$1",[t.id]);
 const repair=(await readFile(new URL('repairs/retry_turn_5027d7a1_memory.sql',base),'utf8')).replaceAll('5027d7a1-3aae-4d05-8843-9599bc714204',t.id);
 await assert.rejects(db.exec(repair),/UPGRADE_012_FIRST/);await db.exec('rollback;');assert.equal((await one('select memory_attempts from chat_turns where id=$1',[t.id])).memory_attempts,3);
 const combined=(await readFile(new URL('repairs/upgrade_012_and_retry_5027d7a1.sql',base),'utf8')).replaceAll('5027d7a1-3aae-4d05-8843-9599bc714204',t.id);await db.exec(combined);await db.exec(combined);
 await db.exec(repair);await db.exec(repair);let row=await one('select * from chat_turns where id=$1',[t.id]);assert.equal(row.memory_status,'retry_pending');assert.equal(row.memory_attempts,2);assert.equal(row.answer,answer);
 const retried=(await one('select petai_claim_memory_retry($1) t',[t.id])).t;assert.equal(retried.memory_attempts,3);await one('select petai_apply_memory($1,$2,$3)',[t.id,retried.lease_token,data]);await one('select petai_apply_memory($1,$2,$3)',[t.id,retried.lease_token,data]);await db.exec(repair);
 row=await one('select * from chat_turns where id=$1',[t.id]);assert.equal(row.status,'completed');assert.equal(row.answer,answer);assert.equal(row.memory_done,true);assert.equal(row.memory_status,'saved');assert.equal(row.memory_attempts,3);
 assert.equal((await one('select count(*)::int n from pets')).n,2);assert.equal((await one('select value from pet_manual_fields where pet_id=$1',[old])).value,20);
 const pet=await one('select id from pets where created_from_turn_id=$1',[t.id]);assert.notEqual(pet.id,old);assert.equal((await one('select details from pet_records where pet_id=$1',[pet.id])).details.kg,7);
 }finally{await db.close()}
});
