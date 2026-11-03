import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {existsSync} from 'node:fs';
import {readFile,readdir} from 'node:fs/promises';
import {validatePetEdit} from '../src/profile-edit.js';
import {preparePetMemory} from '../src/pet-matching.js';
import {petContext} from '../src/jobs.js';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
test('editing validates numeric weights, real dates, enums, versions and field whitelist',()=>{
 assert.equal(validatePetEdit({field:'weight_kg',value:4.5,version:1}).value,4.5);
 for(const b of [{field:'weight_kg',value:-1},{field:'weight_kg',value:'4.5'},{field:'birth_date',value:'2026-02-30'},{field:'species',value:'老虎'},{field:'ownership_confirmed',value:true}])assert.throws(()=>validatePetEdit({...b,version:1}));
 assert.equal(validatePetEdit({field:'neutered',value:false,version:1}).value,false);
 assert.equal(validatePetEdit({field:'birth_date',value:null,version:1}).value,null);
});
test('generic image questions and named third-party facts cannot create pets; responsible carer can',()=>{
 for(const msg of ['这是什么猫？','它叫小白，今年两岁','朋友的猫叫小白，今年两岁']){
  const out=preparePetMemory(JSON.stringify({operations:[{pet:'小白',type:'fact',field:'age_note',value:'两岁',quote:msg}]}),msg,[],null);assert.equal(out.operations.length,0);
 }
 const street='街上这只猫叫小白，今年两岁';assert.equal(preparePetMemory(JSON.stringify({operations:[{pet:'小白',type:'fact',field:'age_note',value:'两岁',quote:street}]}),street,[{id:A,name:'豆豆',ownership_confirmed:true}],A).operations.length,0);
 const msg='我负责照顾朋友的一只猫，今年两岁';const out=preparePetMemory(JSON.stringify({operations:[{pet:'@new',type:'fact',field:'species',value:'猫',quote:msg}]}),msg,[],null);assert.equal(out.operations.length,1);
});
test('009 real Postgres: ownership gate, manual locks, suggestions, optimistic concurrency, RLS and persisted read',{skip:!existsSync(new URL('../../petai-supabase/migrations/009_profile_editing.sql',import.meta.url))},async()=>{
 const db=new PGlite(),one=async(q,p=[])=>(await db.query(q,p)).rows[0];
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to authenticated;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);insert into auth.users values('${A}'),('${B}');`);
 const dir=new URL('../../petai-supabase/migrations/',import.meta.url);for(const f of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.exec((await readFile(new URL(f,dir),'utf8')).replace('create extension if not exists pgcrypto;',''));
 const c=(await one('insert into conversations(owner_id) values($1) returning id',[A])).id;
 const apply=async(msg,operations,extras={})=>{const t=(await one('select petai_submit_turn($1,$2,$3,$4,null,$5,100) t',[A,c,crypto.randomUUID(),msg,crypto.randomUUID()])).t;const lease=(await one('select petai_claim_turn($1) t',[t.id])).t.lease_token;await one('select petai_apply_memory($1,$2,$3)',[t.id,lease,{operations,...extras}]);await one('select petai_complete_turn($1,$2,$3)',[t.id,lease,'原文']);return t.id;};
 await apply('这只猫叫小白',[{pet:'小白',type:'fact',field:'name',value:'小白',quote:'这只猫叫小白'}]);assert.equal((await one('select count(*)::int n from pets')).n,0);
 const msg='我家有一只猫，叫豆豆';await apply(msg,[{pet:'@new',type:'fact',field:'species',value:'猫',quote:msg}],{owned_refs:['@new']});
 const pet=await one('select * from pets');assert.ok(pet.created_from_turn_id);const creation=await one('select owner_id from chat_turns where id=$1',[pet.created_from_turn_id]);assert.equal(creation.owner_id,A);
 const edit=async(field,value,version=1,owner=A,issue=null)=>one('select petai_edit_pet_field($1,$2,$3,$4,$5,$6) t',[owner,pet.id,field,JSON.stringify(value),version,issue]);
 await assert.rejects(edit('name','偷改',1,B),/NOT_FOUND/);
 await edit('name','豆豆',pet.version);await assert.rejects(edit('name','旧页面覆盖',pet.version),/CONFLICT/);
 const nameTurn=await apply('更正，它名字叫毛毛',[{pet:'@current',type:'fact',field:'name',value:'毛毛',correction:true,quote:'更正，它名字叫毛毛'}],{current_pet:pet.id});
 assert.equal((await one('select name from pets')).name,'豆豆');const suggestion=await one("select * from memory_issues where pet_id=$1 and field='name' and status='open'",[pet.id]);assert.equal(suggestion.proposed_value,'毛毛');assert.equal((await one("select count(*)::int n from archive_change_receipts where turn_id=$1 and kind='review'",[nameTurn])).n,1);
 let version=(await one('select version from pets')).version;await edit('name','毛毛',version,A,suggestion.id);assert.equal((await one('select name from pets')).name,'毛毛');await assert.rejects(edit('name','毛毛',version+1,A,suggestion.id),/CONFLICT/);
 version=(await one('select version from pets')).version;await edit('weight_kg',4.5,version);
 const weightTurn=await apply('现在体重5公斤',[{pet:'@current',type:'record',category:'weight',details:{kg:5,description:'现在体重'},quote:'现在体重5公斤'}],{current_pet:pet.id});
 assert.equal((await one("select value from pet_manual_fields where field='weight_kg'")).value,4.5);assert.equal((await one("select count(*)::int n from memory_issues where field='weight_kg' and status='open'")).n,1);
 assert.equal((await one("select count(*)::int n from archive_change_receipts where turn_id=$1",[weightTurn])).n,2);
 const repeated=await apply('现在体重5公斤',[{pet:'@current',type:'record',category:'weight',details:{kg:5,description:'现在体重'},quote:'现在体重5公斤'}],{current_pet:pet.id});assert.equal((await one('select count(*)::int n from archive_change_receipts where turn_id=$1',[repeated])).n,0);
 const breedTurn=await apply('它的品种是英短',[{pet:'@current',type:'fact',field:'breed_description',value:'英短',quote:'它的品种是英短'}],{current_pet:pet.id});assert.equal((await one("select kind from archive_change_receipts where turn_id=$1",[breedTurn])).kind,'updated');
 const unchanged=await apply('它的品种是英短',[{pet:'@current',type:'fact',field:'breed_description',value:'英短',quote:'它的品种是英短'}],{current_pet:pet.id});assert.equal((await one('select count(*)::int n from archive_change_receipts where turn_id=$1',[unchanged])).n,0);
 const adapter={own:async(table,owner,id)=>one('select * from '+table+' where id=$1 and owner_id=$2',[id,owner]),rows:async(table,q)=>(await db.query('select * from '+table+' where owner_id=$1 and pet_id=$2'+(q.status?' and status=$3':''),[q.owner_id.slice(3),q.pet_id.slice(3),...(q.status?[q.status.slice(3)]:[])])).rows};
 const ctx=await petContext(adapter,A,pet.id);assert.equal(ctx.profile.weight_kg,4.5);assert.equal(ctx.profile.name,'毛毛');assert.equal(ctx.manual_fields.length,2);
 assert.equal((await one('select petai_export($1) data',[A])).data.manual_fields.length,2);
 const mixed='我有一只柯基, 3岁半, 体重10Kg, 上次打疫苗是去年11月份, 现在还需要打吗';const {reliableMemory}=await import('../src/explicit-memory.js');const parsed=reliableMemory('',mixed,[{id:pet.id,species:'猫',ownership_confirmed:true}],null);await apply(mixed,parsed.operations,{owned_refs:parsed.owned_refs,current_pet:null});
 const dog=await one("select * from pets where id<>$1 and owner_id=$2",[pet.id,A]);assert.equal(dog.name,'未命名宠物');assert.ok(dog.created_from_turn_id);assert.notEqual(dog.created_from_turn_id,pet.created_from_turn_id);assert.equal((await one("select value from pet_facts where pet_id=$1 and field='age_note'",[dog.id])).value,'3岁半');assert.equal((await one("select date_text from pet_records where pet_id=$1 and category='vaccine'",[dog.id])).date_text,'去年11月份');assert.equal((await one("select details from pet_records where pet_id=$1 and category='weight'",[dog.id])).details.kg,10);assert.equal((await one('select count(*)::int n from pets where owner_id=$1',[A])).n,2);
 await db.exec('set role authenticated');assert.equal((await one('select count(*)::int n from archive_change_receipts')).n,0);await assert.rejects(db.query('delete from archive_change_receipts'),/permission denied/);await assert.rejects(db.query("update pet_manual_fields set value='null'"),/permission denied/);await assert.rejects(db.query('select petai_edit_pet_field($1,$2,$3,$4,$5,null)',[A,pet.id,'name','"伪造"',1]),/permission denied/);await db.exec('reset role');
 }finally{await db.close()}
});
