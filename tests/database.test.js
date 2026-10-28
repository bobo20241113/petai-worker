import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const SQL_DIR=process.env.PETAI_SQL_DIR ? resolve(process.env.PETAI_SQL_DIR) : fileURLToPath(new URL('../../petai-supabase/migrations/',import.meta.url));
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const request='33333333-3333-4333-8333-333333333333';
test('actual Postgres migrations: ownership, RLS, atomic tasks, memory, correction, forget, retry',{skip:!existsSync(resolve(SQL_DIR,'001_schema.sql'))},async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
 create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 insert into auth.users values('${A}'),('${B}');`);
 for(const file of ['001_schema.sql','002_jobs.sql','003_memory_and_privacy.sql']){
  const sql=(await readFile(resolve(SQL_DIR,file),'utf8')).replace('create extension if not exists pgcrypto;','');
  await db.exec(sql);
 }
 const one=async(q,params=[]) => (await db.query(q,params)).rows[0];
 const c=(await one('insert into conversations(owner_id) values($1) returning id',[A])).id;
 const turn=await one('select petai_submit_turn($1,$2,$3,$4,null,$5,100) t',[A,c,request,'我家的豆豆是猫','hash']);const tid=turn.t.id;
 const duplicate=await one('select petai_submit_turn($1,$2,$3,$4,null,$5,100) t',[A,c,request,'我家的豆豆是猫','hash']);assert.equal(duplicate.t.id,tid);
 await assert.rejects(one('select petai_submit_turn($1,$2,$3,$4,null,$5,100)',[A,c,request,'changed','different']),/CONFLICT/);
 await assert.rejects(one('select petai_submit_turn($1,$2,$3,$4,null,$5,100)',[B,c,crypto.randomUUID(),'hack','x']),/NOT_FOUND/);
 await assert.rejects(one('select petai_submit_turn($1,$2,$3,$4,null,$5,100)',[A,c,crypto.randomUUID(),'parallel','x']),/CONFLICT/);
 const claim=(await one('select petai_claim_turn($1) t',[tid])).t;assert.ok(claim.lease_token);
 assert.equal((await one('select petai_claim_turn($1) t',[tid])).t,null);
 const data={operations:[{type:'fact',pet:'豆豆',field:'species',value:'猫',quote:'豆豆是猫',correction:false}],state:{goal:'介绍豆豆'}};
 await one('select petai_apply_memory($1,$2,$3)',[tid,claim.lease_token,data]);
 await one('select petai_apply_memory($1,$2,$3)',[tid,claim.lease_token,data]);
 assert.equal((await one('select count(*)::int n from pets')).n,1);assert.equal((await one('select count(*)::int n from pet_facts')).n,1);
 const pet=(await one('select * from pets')).id;
 await db.exec(await readFile(resolve(SQL_DIR,'../tests/permissions.sql'),'utf8'));
 assert.equal((await one('select pet_id from conversations where id=$1',[c])).pet_id,pet);
 assert.equal((await one('select petai_start_answer($1,$2,$3) yes',[tid,claim.lease_token,{}])).yes,true);
 await one('select petai_complete_turn($1,$2,$3)',[tid,claim.lease_token,'明白，豆豆是猫']);
 await one('select petai_complete_turn($1,$2,$3)',[tid,claim.lease_token,'不重复']);
 assert.equal((await one("select count(*)::int n from messages where role='assistant'")).n,1);
 // Auto-bind a uniquely named existing pet in a new conversation, without a new fact.
 const newc=(await one('insert into conversations(owner_id) values($1) returning id',[A])).id;
 const named=(await one('select petai_submit_turn($1,$2,$3,$4,null,$5,100) t',[A,newc,crypto.randomUUID(),'豆豆多大了','named'])).t;
 const namedClaim=(await one('select petai_claim_turn($1) t',[named.id])).t;
 await one('select petai_bind_pet($1,$2,$3)',[named.id,namedClaim.lease_token,pet]);
 assert.equal((await one('select pet_id from conversations where id=$1',[newc])).pet_id,pet);
 await one('select petai_fail_turn($1,$2,$3,$4)',[named.id,namedClaim.lease_token,'failed','TEST_DONE']);
 // Same owner's new conversation can select the remembered pet, another owner cannot.
 await db.query('insert into conversations(owner_id,pet_id) values($1,$2)',[A,pet]);
 await assert.rejects(db.query('insert into conversations(owner_id,pet_id) values($1,$2)',[B,pet]),/foreign key/);
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${B}';`);
 assert.equal((await one('select count(*)::int n from pets')).n,0);
 await assert.rejects(db.query("insert into pets(owner_id,name) values($1,'伪造')",[B]),/permission denied/);
 await assert.rejects(one('select petai_claim_turn($1)',[tid]),/permission denied/);
 await db.exec(`reset role;`);
 // Conflict isn't silently promoted; explicit correction supersedes old fact.
 const nextTurn=async(msg,ops)=>{
  const t=(await one('select petai_submit_turn($1,$2,$3,$4,null,$5,100) t',[A,c,crypto.randomUUID(),msg,crypto.randomUUID()])).t;
  const claim=(await one('select petai_claim_turn($1) t',[t.id])).t;
  await one('select petai_apply_memory($1,$2,$3)',[t.id,claim.lease_token,{operations:ops,state:{}}]);
  await one('select petai_complete_turn($1,$2,$3)',[t.id,claim.lease_token,'已处理']);return {t,claim};
 };
 await nextTurn('豆豆是狗',[{type:'fact',pet:'@current',field:'species',value:'狗',quote:'豆豆是狗',correction:false}]);
 assert.equal((await one("select value from pet_facts where status='active'")).value,'猫');assert.equal((await one("select count(*)::int n from memory_issues where status='open'")).n,1);
 await nextTurn('刚才说错了，豆豆是狗',[{type:'fact',pet:'@current',field:'species',value:'狗',quote:'刚才说错了，豆豆是狗',correction:true}]);
 assert.equal((await one("select value from pet_facts where status='active'")).value,'狗');
 await nextTurn('忘记豆豆的物种',[{type:'forget_fact',pet:'@current',field:'species',quote:'忘记豆豆的物种'}]);
 assert.equal((await one("select count(*)::int n from pet_facts where status='active'")).n,0);
 assert.ok((await one('select count(*)::int n from messages where memory_excluded')).n>=2);
 // Late/lost upstream result is marked needs_review and retry requires explicit consent.
 const t=(await one('select petai_submit_turn($1,$2,$3,$4,null,$5,100) t',[A,c,crypto.randomUUID(),'测试问题','test'])).t;
 const cl=(await one('select petai_claim_turn($1) t',[t.id])).t;
 await one('select petai_start_answer($1,$2,$3)',[t.id,cl.lease_token,{}]);
 await one('select petai_fail_turn($1,$2,$3,$4)',[t.id,cl.lease_token,'failed','TIMEOUT']);
 assert.equal((await one('select status from chat_turns where id=$1',[t.id])).status,'needs_review');
 await assert.rejects(one("select petai_turn_action($1,$2,'retry',false)",[A,t.id]),/CONFLICT/);
 await one("select petai_turn_action($1,$2,'retry',true)",[A,t.id]);
 await one("select petai_turn_action($1,$2,'cancel',false)",[A,t.id]);
 // Memory-only retries have their own durable state and don't repeat answers.
 await db.query("update chat_turns set memory_done=false,memory_status='pending' where id=$1",[tid]);
 await one('select petai_request_memory_retry($1,$2)',[A,tid]);
 const mem=(await one('select petai_claim_memory_retry($1) t',[tid])).t;assert.equal(mem.status,'completed');
 assert.equal((await one('select petai_claim_memory_retry($1) t',[tid])).t,null);
 await db.query("update chat_turns set lease_until=now()-interval '1 minute' where id=$1",[tid]);
 await one('select petai_recover()');
 assert.equal((await one('select memory_status from chat_turns where id=$1',[tid])).memory_status,'pending');
 // Conversation deletion keeps established pet records, data wipe removes them.
 await one('select petai_delete_conversation($1,$2)',[A,c]);
 assert.equal((await one('select count(*)::int n from pets')).n,1);
 await one('select petai_delete_data($1)',[A]);assert.equal((await one('select count(*)::int n from pets')).n,0);
 }finally{await db.close();}
});
