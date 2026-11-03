import {ownedStatement,responsibilityStatement,namedEvidence,thirdParty,isDescriptionLabel,ownershipReplyPet,deniesOwnership} from './pet-identity.js';
import {uuid} from './core.js';
import {parseExtraction,isGenericPetName,explicitlyNamed} from './memory.js';
function mentioned(text,name){
 if(/^[a-z0-9 _-]+$/i.test(name))return new RegExp('(^|[^a-z0-9_])'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^a-z0-9_])','i').test(text);
 return text.includes(name);
}
// A match supplies context only; animal categories, pictures and a sole stored pet
// are never evidence that the user means that individual.
export function resolvePetMatch(pets,message,currentId=null,profile=null,{allowDefault=true,confirmedOwnershipId=null}={}){
 if(deniesOwnership(message))return {id:null,ambiguous:true};
 if(confirmedOwnershipId&&pets.some(p=>p.id===confirmedOwnershipId))return {id:confirmedOwnershipId,ambiguous:false};
 const eligible=allowDefault&&pets.length<100?pets.filter(p=>p.default_eligible===true||p.ownership_confirmed===true):[];
 const fallback=pets.find(p=>p.id===currentId)||(eligible.length===1?eligible[0]:null);
 const valid=pets.filter(p=>!isGenericPetName(p.name)||explicitlyNamed(message,p.name)||(p.id===currentId&&(profile?.name===p.name||p.ownership_confirmed))||p.name_confirmed===true||(ownedStatement(message)&&message.includes(p.name)));
 if((thirdParty.test(message)&&!responsibilityStatement(message)))return {id:null,ambiguous:true};
 let hits=valid.filter(p=>mentioned(message,p.name)&&!message.includes('不是'+p.name)&&!message.includes('不问'+p.name));
 const focus=message.match(/(?:现在(?:问|聊)|这次(?:问|聊)|说的是|问的是|换成|改聊|改问)\s*([^。？?！!]+)/)?.[1];
 if(focus)hits=valid.filter(p=>mentioned(focus,p.name));
 if(focus&&!hits.length)return {id:null,ambiguous:false};
 if(hits.length>1)return {id:null,ambiguous:true};
 const intro=message.match(/(?:我家(?:的)?|我的)([^，,。？?！!\s]{1,20}?)(?:是(?:一只)?(?:猫|狗)|今年|体重|出生|今天|现在|最近|昨天|已经)/);
 const named=message.match(/(?:名字叫|名字是|名叫|叫做|取名为)\s*[“"「]?([^，,。？?！!\s”"」]{1,20})/);
 const introduced=named?.[1]||intro?.[1];
 if(!hits.length&&/两只|三只|多只|(?:[2-9]|[1-9][0-9]+)只|猫.{0,8}(?:和|与|跟|还有|、).{0,8}狗|狗.{0,8}(?:和|与|跟|还有|、).{0,8}猫/.test(message))return {id:null,ambiguous:true};
 const personalSpecies=message.match(/(?:我家(?:的)?|我的|问的是|说的是).{0,12}?(猫|狗)/)?.[1];
 const specific=personalSpecies?pets.filter(p=>(p.ownership_confirmed||p.default_eligible)&&p.species===personalSpecies):[];
 if(!hits.length&&specific.length===1&&!/两只|三只|多只|另一只|另外一只|又.{0,5}(?:养|领养)/.test(message))return {id:specific[0].id,ambiguous:false};
 if(introduced&&fallback&&fallback.name_confirmed===false&&(!personalSpecies||!fallback.species||personalSpecies===fallback.species)&&namedEvidence(message,introduced)&&!/(?:又|新|再|另一|另外).{0,8}(?:养|猫|狗|宠物)/.test(message))return {id:fallback.id,ambiguous:false};
 if(introduced&&fallback&&fallback.name_confirmed===false&&/^(?:它|这只|名字).{0,8}(?:叫|名字)/.test(message))return {id:fallback.id,ambiguous:false};
 if(introduced&&!isGenericPetName(introduced)&&!valid.some(p=>p.name===introduced))return {id:null,ambiguous:false};
 if(hits.length===1)return {id:hits[0].id,ambiguous:false};
 if(/养(?:猫|狗|犬)|养犬|禁养/.test(message)&&!/(?:它|这只|这条|我家|我的)/.test(message))return {id:null,ambiguous:false};
 if(/(?:又|新|再).{0,5}(?:领养|收养|养了)|(?:另外|另一).{0,3}(?:猫|狗|宠物)/.test(message))return {id:null,ambiguous:!ownedStatement(message)};
 if(/两只|三只|多只|(?:[2-9]|[1-9][0-9]+)只|一只.{0,24}(?:另一只|一只)|猫.{0,8}(?:和|与|还有|、).{0,8}狗|狗.{0,8}(?:和|与|还有|、).{0,8}猫/.test(message))return {id:null,ambiguous:true};
 if(/(?:另一只|另外一只|换(?:一只|聊)|不是它)/.test(message))return {id:null,ambiguous:true};
 const animal=message.match(/(?:我家(?:的)?|我的|问的是|说的是).{0,4}?(猫|狗)/)?.[1];
 const species=profile?.species||fallback?.species;
 if(animal&&species&&animal!==species)return {id:null,ambiguous:true};
 return {id:valid.some(p=>p.id===currentId)?currentId:!currentId&&eligible.length===1?eligible[0].id:null,ambiguous:!currentId&&eligible.length>1};
}
export function preparePetMemory(answer,message,pets,currentId,allowBinding=true,history=[]){
 const parsed=parseExtraction(answer,message,{allowUnnamed:true});
 const multiple=/两只|三只|多只|(?:[2-9]|[1-9][0-9]+)只|一只.{0,24}(?:另一只|一只)|猫.{0,8}(?:和|与|还有|、).{0,8}狗|狗.{0,8}(?:和|与|还有|、).{0,8}猫/.test(message);
 const current=pets.find(p=>p.id===currentId);
 const namingReply=/^(?:它|这只|名字|叫)/.test(message.trim())||/名字|叫什么|叫啥|name/i.test([...history].reverse().find(m=>m.role==='assistant')?.content||'');
 const owns=!deniesOwnership(message)&&!(thirdParty.test(message)&&!responsibilityStatement(message))&&(ownedStatement(message)||ownershipReplyPet(message,history,pets,currentId)===currentId&&!!currentId||current?.ownership_confirmed===true||(namingReply&&history.some(m=>m.role==='user'&&ownedStatement(m.content))));
 const ownedRefs=new Set(),names=new Set();const declaredNames=new Set();
 parsed.operations=parsed.operations.filter(op=>{
  if(deniesOwnership(message)||(thirdParty.test(message)&&!responsibilityStatement(message)))return false;
  if(op.pet==='@new'){if(!(ownedStatement(message)||(namingReply&&history.some(m=>m.role==='user'&&ownedStatement(m.content))))||multiple)return false;if(!currentId&&pets.length&&!/(?:又|新|再|另外|另一|刚).{0,8}(?:养|领养|收养|猫|狗|宠物)|(?:领养|收养).{0,12}(?:只|猫|狗|宠物)/.test(message))return false;if(currentId)return false;}
  if(!uuid(op.pet)&&!['@current','@new'].includes(op.pet)&&namedEvidence(message,op.pet)){names.add(op.pet);declaredNames.add(op.pet);}
  if(op.type==='fact'&&op.field==='name'&&message.includes(String(op.value))&&(namedEvidence(message,String(op.value))||(namingReply&&message.trim()===op.value)))names.add(String(op.value));
  if(current&&current.name_confirmed===false&&!uuid(op.pet)&&op.pet!=='@current'&&!pets.some(p=>p.name===op.pet)&&names.has(op.pet)){op.pet='@current';}
  let accepted=false;
  if(op.pet==='@current')accepted=!!currentId;
  else if(op.pet==='@new')accepted=owns;
  else {
   const pet=pets.find(p=>p.id===op.pet||p.name===op.pet);
   if(pet)accepted=(!isGenericPetName(pet.name)||pet.id===currentId||explicitlyNamed(message,pet.name))&&(pet.id===currentId||mentioned(message,pet.name));
   else if(!uuid(op.pet))accepted=(ownedStatement(message)||(!currentId&&namingReply&&history.some(m=>m.role==='user'&&ownedStatement(m.content))))&&(!isGenericPetName(op.pet)||explicitlyNamed(message,op.pet));
  }
  if(accepted&&owns)ownedRefs.add(op.pet);
  if(accepted&&!['@current','@new'].includes(op.pet)&&!uuid(op.pet)&&namedEvidence(message,op.pet))names.add(op.pet);
  return accepted;
 });
 if(owns&&currentId)ownedRefs.add(currentId);
 if(current?.name_confirmed===false&&declaredNames.size===1&&parsed.operations.length<12&&!parsed.operations.some(o=>o.type==='fact'&&o.field==='name')){const name=[...declaredNames][0];parsed.operations.push({type:'fact',pet:'@current',field:'name',value:name,quote:message,correction:false});names.add(name);}
 return {...parsed,current_pet:currentId||null,allow_binding:allowBinding,owned_refs:[...ownedRefs],confirmed_names:[...names]};
}
// Old memory retries must use that turn's target, never a later conversation's pet.
export function memoryPetFromSnapshot(snapshot){
 if(snapshot&&Object.hasOwn(snapshot,'memory_pet_id'))return uuid(snapshot.memory_pet_id)?snapshot.memory_pet_id:null;
 try{const p=JSON.parse(snapshot?.variables?.petProfile||'null');return uuid(p?.id)?p.id:null}catch{return null}
}
