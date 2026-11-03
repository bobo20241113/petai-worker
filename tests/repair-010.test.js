import test from 'node:test';import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';import {readFile,readdir} from 'node:fs/promises';import {existsSync} from 'node:fs';
const base=new URL('../../petai-supabase/',import.meta.url),U='11111111-1111-4111-8111-111111111111';
test('repair restores missing 010 with existing 011, is repeatable and preserves records/manual locks', {skip:!existsSync(new URL('repairs/repair_missing_010.sql',base))},async()=>{
 const db=new PGlite(),one=async(q,p=[])=>(await db.query(q,p)).rows[0];try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to authenticated;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);insert into auth.users values('${U}');`);
 for(const f of (await readdir(new URL('migrations/',base))).filter(f=>f.endsWith('.sql')&&!f.startsWith('010')).sort())await db.exec((await readFile(new URL('migrations/'+f,base),'utf8')).replace('create extension if not exists pgcrypto;',''));
 const pet=(await one("insert into pets(owner_id,name,ownership_confirmed,name_confirmed) values($1,'原宠物',true,true) returning id",[U])).id;
 await one("insert into pet_manual_fields(pet_id,owner_id,field,value) values($1,$2,'weight_kg','10')",[pet,U]);
 const c=(await one('insert into conversations(owner_id,pet_id) values($1,$2) returning id',[U,pet])).id;
 let checks=(await db.query(await readFile(new URL('diagnostics/archive_notices_check.sql',base),'utf8'))).rows;assert.equal(checks.find(c=>c.item.startsWith('010')).status,'MISSING');assert.ok(checks.filter(c=>c.item.startsWith('011')).every(c=>c.status==='OK'));
 const repair=await readFile(new URL('repairs/repair_missing_010.sql',base),'utf8');await db.exec(repair);await db.exec(repair);
 assert.equal((await one('select count(*)::int n from pets')).n,1);assert.equal((await one("select value from pet_manual_fields where pet_id=$1",[pet])).value,10);assert.equal((await one('select pet_id from conversations where id=$1',[c])).pet_id,pet);
 checks=(await db.query(await readFile(new URL('diagnostics/archive_notices_check.sql',base),'utf8'))).rows;assert.ok(checks.every(c=>c.status==='OK'));
 const apply=async(msg,ops,more)=>{const t=(await one('select petai_submit_turn($1,$2,$3,$4,null,$5,100) t',[U,c,crypto.randomUUID(),msg,crypto.randomUUID()])).t;const lease=(await one('select petai_claim_turn($1) t',[t.id])).t.lease_token;await one('select petai_apply_memory($1,$2,$3)',[t.id,lease,{operations:ops,...more}]);await one('select petai_complete_turn($1,$2,$3)',[t.id,lease,'原样回答']);return t.id};
 const msg='我新养了一只柯基',created=await apply(msg,[{type:'fact',pet:'@new',field:'species',value:'狗',quote:msg}],{current_pet:null,owned_refs:['@new']});assert.equal((await one('select count(*)::int n from pets where created_from_turn_id=$1',[created])).n,1);
 const measured='昨天称重15kg了';await apply(measured,[{type:'record',pet:'@current',category:'weight',details:{kg:15,description:'主人提供的体重'},quote:measured,date_text:'昨天'}],{current_pet:pet});assert.equal((await one('select value from pet_manual_fields where pet_id=$1',[pet])).value,10);assert.equal((await one("select proposed_value from memory_issues where pet_id=$1 and field='weight_kg' and status='open'",[pet])).proposed_value,15);
 await db.exec('set role authenticated');await assert.rejects(db.query('select petai_apply_memory(null,null,null)'),/permission denied/);await db.exec('reset role');
 }finally{await db.close()}
});
