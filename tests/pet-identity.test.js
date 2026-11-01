import test from 'node:test';
import assert from 'node:assert/strict';
import {identityMeta,isDescriptionLabel,petSummaries,ownershipReplyPet,ownedStatement} from '../src/pet-identity.js';
import {resolvePetMatch,preparePetMemory} from '../src/pet-matching.js';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
test('appearance labels are not names; an explicitly given unusual name is preserved',()=>{
 for(const name of ['橘白猫','英短','巴厘猫','布偶','灰白短毛猫','金毛','猫'])assert.equal(isDescriptionLabel(name),true,name);
 assert.equal(identityMeta({name:'可爱',name_confirmed:false},[{field:'name',value:'可爱',quote:'我家可爱的猫很乖'}]).name_confirmed,false);assert.equal(ownedStatement('这不是我的橘白猫'),false);assert.equal(isDescriptionLabel('豆豆'),false);assert.equal(isDescriptionLabel('小橘'),false);
 const pet={name:'橘白猫',ownership_confirmed:true,name_confirmed:false};const m=identityMeta(pet,[{field:'species',value:'猫'}]);assert.equal(m.name,'');assert.equal(m.display_name,'未命名的猫');assert.equal(m.default_eligible,true);
 assert.equal(identityMeta(pet,[{field:'name',value:'橘白猫',quote:'它名字叫橘白猫'}]).name,'橘白猫');
});
test('a sole verified pet is reused in a new chat; unknown ownership, explicit other subjects and multiple pets are not defaulted',()=>{
 const a={id:A,name:'未命名宠物',name_confirmed:false,ownership_confirmed:true,default_eligible:true,species:'猫'};
 assert.equal(resolvePetMatch([a],'它多大了').id,A);assert.equal(resolvePetMatch([a],'它多大了',null,null,{allowDefault:false}).id,null);assert.equal(resolvePetMatch([a,{id:B,name:'猫'}],'它多大了',B).id,null);assert.equal(resolvePetMatch([a],'我家猫需要驱虫吗').id,A);
 assert.equal(resolvePetMatch([{...a,ownership_confirmed:false,default_eligible:false}],'它多大了').id,null);
 assert.equal(resolvePetMatch([a,{...a,id:B}],'它多大了').id,null);
 for(const s of ['朋友的猫呢','我家狗要驱虫吗','我又领养了一只猫','另一只猫呢'])assert.equal(resolvePetMatch([a],s).id,null,s);
});
test('self-owned unnamed pets get one identity without a fabricated colour-as-name',()=>{
 const message='我有一只橘白猫，今年2岁';const answer=JSON.stringify({operations:[{type:'fact',pet:'橘白猫',field:'species',value:'猫',quote:message},{type:'fact',pet:'橘白猫',field:'age_note',value:'2岁',quote:message},{type:'fact',pet:'橘白猫',field:'name',value:'橘白猫',quote:message}]});
 assert.equal(preparePetMemory(answer,message,[{id:A,name:'豆豆',ownership_confirmed:true}],A).operations.length,0);
 const out=preparePetMemory(answer,message,[],null);assert.equal(out.operations.length,2);assert.ok(out.operations.every(o=>o.pet==='@new'));assert.deepEqual(out.owned_refs,['@new']);assert.deepEqual(out.confirmed_names,[]);
 assert.throws(()=>preparePetMemory(answer,message.replace('我有','朋友有'),[],null));
 const other='朋友有一只橘白猫，今年2岁';assert.equal(preparePetMemory(JSON.stringify({operations:[{type:'fact',pet:'橘白猫',field:'species',value:'猫',quote:other}]}),other,[],null).operations.length,0);
});
test('giving an unnamed pet a name updates that identity instead of creating a duplicate',()=>{
 const pet={id:A,name:'未命名宠物',name_confirmed:false,ownership_confirmed:true};
 const out=preparePetMemory(JSON.stringify({operations:[{type:'fact',pet:'豆豆',field:'name',value:'豆豆',quote:'它叫豆豆'}]}),'它叫豆豆',[pet],A);
 assert.equal(out.operations[0].pet,'@current');assert.deepEqual(out.confirmed_names,['豆豆']);
});
test('account summary reads are owner-scoped and preserve unavailable legacy provenance',async()=>{
 const db={rows:async(table,q)=>{assert.equal(q.owner_id,'eq.'+A);if(table==='pets')return [{id:B,name:'橘白猫',ownership_confirmed:false,name_confirmed:false}];assert.equal(q.pet_id,'in.('+B+')');return [{pet_id:B,field:'species',value:'猫',quote:'这是什么猫'}]}};
 const [p]=await petSummaries(db,A);assert.equal(p.default_eligible,false);assert.equal(p.name,'');assert.equal(p.legacy_label,'橘白猫');
});

test('an affirmative to a clear ownership question can confirm a known historical pet, but not ambiguous or negative questions',()=>{
 const pets=[{id:A,name:'橘白猫',name_confirmed:false,ownership_confirmed:false}];const h=[{role:'user',content:'橘白猫多大了'},{role:'assistant',content:'这只橘白猫是你养的吗？'}];
 const id=ownershipReplyPet('是的',h,pets);assert.equal(id,A);assert.equal(resolvePetMatch(pets,'是的',null,null,{allowDefault:false,confirmedOwnershipId:id}).id,A);
 const out=preparePetMemory('{"operations":[]}','是的',pets,A,true,h);assert.deepEqual(out.owned_refs,[A]);
 assert.equal(ownershipReplyPet('是的',[{role:'assistant',content:'它不是你养的对吗？'}],pets),null);
 assert.equal(ownershipReplyPet('是的',[{role:'assistant',content:'它是你养的吗？'}],[...pets,{id:B,name:'另一只猫'}]),null);
});

test('a unique explicit species identifies one pet among several; naming the sole unnamed pet preserves its identity',()=>{
 const cats={id:A,name:'未命名宠物',name_confirmed:false,ownership_confirmed:true,default_eligible:true,species:'猫'};const dog={...cats,id:B,species:'狗'};
 assert.equal(resolvePetMatch([cats,dog],'我家的猫该驱虫吗').id,A);assert.equal(resolvePetMatch([cats,dog],'我家猫和狗都要驱虫吗').id,null);
 assert.equal(resolvePetMatch([cats],'我家的豆豆是猫').id,A);
 const msg='我家的豆豆是猫';const result=preparePetMemory(JSON.stringify({operations:[{type:'fact',pet:'豆豆',field:'species',value:'猫',quote:msg}]}),msg,[cats],A);
 assert.ok(result.operations.every(o=>o.pet==='@current'));assert.equal(result.operations.find(o=>o.field==='name').value,'豆豆');
});
