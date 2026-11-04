import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile,readdir} from 'node:fs/promises';
const root=new URL('../../petai-supabase/migrations/',import.meta.url),U='11111111-1111-4111-8111-111111111111',V='22222222-2222-4222-8222-222222222222';
test('single archive deletion enforces owner, cascades archive data, retains chats, and blocks old jobs from recreating pets',async()=>{
 const db=new PGlite(),one=async(q,p=[])=>(await db.query(q,p)).rows[0];try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to authenticated;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);insert into auth.users values('${U}'),('${V}');`);
 for(const f of (await readdir(root)).filter(f=>f.endsWith('.sql')).sort())await db.exec((await readFile(new URL(f,root),'utf8')).replace('create extension if not exists pgcrypto;',''));
 await db.exec(await readFile(new URL('013_pet_deletion.sql',root),'utf8')); // migration is repeatable
 const pet=async(owner,name)=>(await one('insert into pets(owner_id,name,ownership_confirmed,name_confirmed) values($1,$2,true,true) returning id',[owner,name])).id;
 const A=await pet(U,'豆豆'),B=await pet(U,'茄茄'),other=await pet(V,'小白');const C=(await one('insert into conversations(owner_id,pet_id) values($1,$2) returning id',[U,A])).id;
 const D=(await one('insert into conversations(owner_id,pet_id) values($1,$2) returning id',[U,B])).id;
 const submit=async(c,msg)=>(await one('select petai_submit_turn($1,$2,$3,$4,null,$5,100) t',[U,c,crypto.randomUUID(),msg,crypto.randomUUID()])).t;
 const msg='豆豆是我家的猫，4公斤',t=await submit(C,msg),lease=(await one('select petai_claim_turn($1) t',[t.id])).t.lease_token;
 const data={schema_version:2,current_pet:A,owned_refs:[A],focus_ref:A,allow_binding:true,operations:[{type:'fact',pet:A,field:'species',value:'猫',quote:msg},{type:'record',pet:A,category:'weight',details:{kg:4,description:'4公斤'},quote:msg}],state:{topic:'豆豆'}};
 await one('select petai_apply_memory($1,$2,$3)',[t.id,lease,data]);await one('select petai_complete_turn($1,$2,$3)',[t.id,lease,'**原始回答**']);
 await one("insert into pet_manual_fields(owner_id,pet_id,field,value) values($1,$2,'age_note','\"两岁\"')",[U,A]);
 await one("insert into memory_issues(owner_id,pet_id,field,proposed_value,reason) values($1,$2,'age_note','\"三岁\"','test')",[U,A]);
 const untouched=await submit(D,'茄茄今天很开心');
 const pending=await submit(C,'豆豆还有新的体重记录');const activeLease=(await one('select petai_claim_turn($1) t',[pending.id])).t.lease_token;
 await assert.rejects(one('select petai_delete_pet($1,$2)',[U,A]),/PET_BUSY/);assert.ok(await one('select id from pets where id=$1',[A]));
 await one("update chat_turns set status='pending',lease_token=null,lease_until=null where id=$1",[pending.id]);
 await assert.rejects(one('select petai_delete_pet($1,$2)',[V,A]),/NOT_FOUND/);
 const denied=await one("select has_function_privilege('authenticated','petai_delete_pet(uuid,uuid)','EXECUTE') allowed");assert.equal(denied.allowed,false);
 const before=(await db.query('select id,content from messages where conversation_id=$1 order by sequence',[C])).rows;
 const result=await one('select petai_delete_pet($1,$2) r',[U,A]);assert.equal(result.r.deleted,true);assert.equal(result.r.chat_history_retained,true);
 assert.equal(await one('select id from pets where id=$1',[A]),undefined);assert.ok(await one('select id from pets where id=$1',[B]));assert.ok(await one('select id from pets where id=$1',[other]));
 for(const table of ['pet_facts','pet_records','pet_manual_fields','memory_issues','archive_change_receipts'])assert.equal((await one('select count(*)::int n from '+table+' where pet_id=$1',[A])).n,0);
 assert.deepEqual((await db.query('select id,content from messages where conversation_id=$1 order by sequence',[C])).rows,before);assert.equal((await one('select pet_id from conversations where id=$1',[C])).pet_id,null);assert.equal((await one('select pet_id from conversations where id=$1',[D])).pet_id,B);
 assert.equal((await one('select memory_done from chat_turns where id=$1',[untouched.id])).memory_done,false);
 assert.equal((await one('select count(*)::int n from messages where conversation_id=$1 and not memory_excluded',[C])).n,0);
 const retryLease=(await one('select petai_claim_turn($1) t',[pending.id])).t.lease_token;
 const stale={schema_version:2,current_pet:A,owned_refs:['@new:new_a'],focus_ref:'@new:new_a',allow_binding:true,operations:[{type:'fact',pet:'@new:new_a',field:'species',value:'猫',quote:'豆豆还有新的体重记录'}],state:{}};
 await one('select petai_apply_memory($1,$2,$3)',[pending.id,retryLease,stale]);assert.equal((await one('select count(*)::int n from pets where owner_id=$1',[U])).n,1);assert.equal((await one('select memory_done from chat_turns where id=$1',[pending.id])).memory_done,true);
 await one('select petai_complete_turn($1,$2,$3)',[pending.id,retryLease,'新的回答']);
 const freshMsg='我收养了另一只猫',fresh=await submit(C,freshMsg),freshLease=(await one('select petai_claim_turn($1) t',[fresh.id])).t.lease_token;
 await one('select petai_apply_memory($1,$2,$3)',[fresh.id,freshLease,{...stale,current_pet:null,operations:[{...stale.operations[0],quote:freshMsg}]}]);assert.equal((await one('select count(*)::int n from pets where owner_id=$1',[U])).n,2);
 await assert.rejects(one('select petai_delete_pet($1,$2)',[U,A]),/NOT_FOUND/);
 await db.exec(await readFile(new URL('012_semantic_subjects.sql',root),'utf8'));await assert.rejects(one('select petai_delete_pet($1,$2)',[U,B]),/PET_DELETE_UPGRADE_REQUIRED/);assert.ok(await one('select id from pets where id=$1',[B]));
 }finally{await db.close()}
});
