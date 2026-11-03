import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const SQL_DIR=process.env.PETAI_SQL_DIR?resolve(process.env.PETAI_SQL_DIR):fileURLToPath(new URL('../../petai-supabase/migrations/',import.meta.url));
import {identityMeta,isDescriptionLabel} from '../src/pet-identity.js';
import {preparePetMemory} from '../src/pet-matching.js';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
test('006 upgrades legacy provenance, creates one unnamed pet and renames it without losing records',{skip:!existsSync(resolve(SQL_DIR,'006_account_pet_library.sql'))?'requires Supabase migration sources (sibling directory or PETAI_SQL_DIR)':false},async()=>{
 const db=new PGlite();const one=async(q,p=[])=>(await db.query(q,p)).rows[0];
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to authenticated;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);insert into auth.users values('${A}'),('${B}');`);
 for(const name of ['001_schema.sql','002_jobs.sql','003_memory_and_privacy.sql','004_answer_passthrough.sql','005_automatic_pet_matching.sql'])await db.exec((await readFile(resolve(SQL_DIR,name),'utf8')).replace('create extension if not exists pgcrypto;',''));
 const conversation=async(owner)=>(await one('insert into conversations(owner_id) values($1) returning id',[owner])).id;
 const turn=async(owner,c,msg)=>{const t=(await one('select petai_submit_turn($1,$2,$3,$4,null,$5,100) t',[owner,c,crypto.randomUUID(),msg,crypto.randomUUID()])).t;const claim=(await one('select petai_claim_turn($1) t',[t.id])).t;return{t,lease:claim.lease_token}};
 const apply=async(x,data)=>{await one('select petai_apply_memory($1,$2,$3)',[x.t.id,x.lease,data]);await one('select petai_complete_turn($1,$2,$3)',[x.t.id,x.lease,'FastGPT原文'])};
 const c=await conversation(A),raw='我家有一只橘白猫，今年2岁';let t=await turn(A,c,raw);
 await apply(t,{operations:[{type:'fact',pet:'橘白猫',field:'species',value:'猫',quote:raw},{type:'fact',pet:'橘白猫',field:'name',value:'橘白猫',quote:raw},{type:'fact',pet:'橘白猫',field:'age_note',value:'2岁',quote:raw}]});
 const legacy=(await one('select pet_id from conversations where id=$1',[c])).pet_id;
 const ghost=await conversation(A);t=await turn(A,ghost,'这是什么英短？');await apply(t,{operations:[{type:'fact',pet:'英短',field:'species',value:'猫',quote:'这是什么英短？'}]});
 const before=(await one('select count(*)::int n from pet_facts')).n;
 await db.exec(await readFile(resolve(SQL_DIR,'006_account_pet_library.sql'),'utf8'));
 assert.equal((await one('select count(*)::int n from pet_facts')).n,before);
 const old=await one('select * from pets where id=$1',[legacy]);assert.equal(old.ownership_confirmed,true);assert.equal(old.name_confirmed,false);
 assert.equal((await one("select ownership_confirmed from pets where name='英短'")).ownership_confirmed,false);
 for(const n of ['橘白猫','英短','巴厘猫','豆豆','小橘'])assert.equal((await one('select petai_description_label($1) yes',[n])).yes,isDescriptionLabel(n));
 const b=await conversation(B),intro='我有一只橘白猫，今年2岁';t=await turn(B,b,intro);
 await apply(t,preparePetMemory(JSON.stringify({operations:[{type:'fact',pet:'橘白猫',field:'species',value:'猫',quote:intro},{type:'fact',pet:'橘白猫',field:'age_note',value:'2岁',quote:intro}]}),intro,[],null));
 const unnamed=await one('select * from pets where owner_id=$1',[B]);assert.equal(unnamed.name,'未命名宠物');assert.equal(unnamed.ownership_confirmed,true);assert.equal(unnamed.name_confirmed,false);
 t=await turn(B,b,'它叫豆豆');await apply(t,preparePetMemory(JSON.stringify({operations:[{type:'fact',pet:'豆豆',field:'name',value:'豆豆',quote:'它叫豆豆'}]}),'它叫豆豆',[unnamed],unnamed.id));
 const renamed=await one('select * from pets where owner_id=$1',[B]);assert.equal(renamed.id,unnamed.id);assert.equal(renamed.name,'豆豆');assert.equal(renamed.name_confirmed,true);assert.equal((await one('select count(*)::int n from pets where owner_id=$1',[B])).n,1);
 assert.equal((await one("select count(*)::int n from pet_facts where pet_id=$1 and status='active'",[renamed.id])).n,3);
 t=await turn(A,c,'它叫小橘');await apply(t,preparePetMemory(JSON.stringify({operations:[{type:'fact',pet:'小橘',field:'name',value:'小橘',quote:'它叫小橘'}]}),'它叫小橘',[old],legacy));
 assert.equal((await one('select name from pets where id=$1',[legacy])).name,'小橘');assert.equal((await one("select status from pet_facts where pet_id=$1 and field='name' and value='\"橘白猫\"'",[legacy])).status,'superseded');
 await db.exec(await readFile(resolve(SQL_DIR,'../tests/permissions.sql'),'utf8'));
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${B}';`);assert.equal((await one('select count(*)::int n from pets')).n,1);await assert.rejects(db.query('update pets set ownership_confirmed=true'),/permission denied/);
 
 await db.exec('reset role');
 const {reliableMemory}=await import('../src/explicit-memory.js');
 const durableRaw='我家新养了一只猫，名字叫小满，品种是英短，年龄是2岁，体重4.5公斤，2026-10-01打了猫三联。';
 const durableConv=(await one('insert into conversations(owner_id) values($1) returning id',[A])).id;
 const durableTurn=(await one('select petai_submit_turn($1,$2,$3,$4,null,$5,100) t',[A,durableConv,crypto.randomUUID(),durableRaw,'durable'])).t;
 const durableLease=(await one('select petai_claim_turn($1) t',[durableTurn.id])).t;
 await one('select petai_apply_memory($1,$2,$3)',[durableTurn.id,durableLease.lease_token,reliableMemory('',durableRaw,[],null)]);
 // Re-read using DB-backed profile code, as a refreshed page/new conversation would.
 const savedPet=(await one("select id from pets where owner_id=$1 and name='小满'",[A])).id;
 const adapter={own:async(table,owner,id)=>(await db.query('select * from '+table+' where id=$1 and owner_id=$2',[id,owner])).rows[0],rows:async(table,query)=>(await db.query('select * from '+table+' where owner_id=$1 and pet_id=$2 and status=$3',[query.owner_id.slice(3),query.pet_id.slice(3),query.status.slice(3)])).rows};
 const {petContext}=await import('../src/jobs.js');const persisted=await petContext(adapter,A,savedPet);assert.equal(persisted.profile.name,'小满');assert.equal(persisted.profile.age_note,'2岁');assert.equal(persisted.profile.breed_description,'英短');assert.equal(persisted.records.find(r=>r.category==='weight').details.kg,4.5);assert.ok(persisted.records.some(r=>r.category==='vaccine'));
 await db.exec(await readFile(resolve(SQL_DIR,'008_feedback.sql'),'utf8'));
 await one("insert into feedback_messages(owner_id,category,message) values($1,'bug','测试留言持久保存')",[A]);
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from feedback_messages'),/permission denied/);await db.exec('reset role');
}finally{await db.close()}
});
