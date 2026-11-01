import {uuid} from './core.js';
import {parseExtraction,isGenericPetName,explicitlyNamed} from './memory.js';
const ownPet=/(?:我(?:们)?有(?:一只|只)?(?:猫|狗|宠物)|我(?:们)?家|我(?:们)?的(?!朋友|邻居|同事|客户)|我(?:们)?(?:最近|刚刚?|新|又)?(?:养|领养|收养)|自己养|\bmy (?:cat|dog|pet)\b|\bi (?:have|own|adopted)\b)/i;
const thirdParty=/(?:朋友|邻居|同事|别人|他人|客户)(?:的|家|养|领养|收养)|\b(?:friend|neighbor|colleague)'?s\b/i;
function mentioned(text,name){
 if(/^[a-z0-9 _-]+$/i.test(name))return new RegExp('(^|[^a-z0-9_])'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^a-z0-9_])','i').test(text);
 return text.includes(name);
}
// A match supplies context only; animal categories, pictures and a sole stored pet
// are never evidence that the user means that individual.
export function resolvePetMatch(pets,message,currentId=null,profile=null){
 const valid=pets.filter(p=>!isGenericPetName(p.name)||explicitlyNamed(message,p.name)||(p.id===currentId&&profile?.name===p.name));
 if(thirdParty.test(message))return {id:null,ambiguous:true};
 let hits=valid.filter(p=>mentioned(message,p.name)&&!message.includes('不是'+p.name)&&!message.includes('不问'+p.name));
 const focus=message.match(/(?:现在(?:问|聊)|这次(?:问|聊)|说的是|问的是|换成|改聊|改问)\s*([^。？?！!]+)/)?.[1];
 if(focus)hits=valid.filter(p=>mentioned(focus,p.name));
 if(focus&&!hits.length)return {id:null,ambiguous:false};
 if(hits.length>1)return {id:null,ambiguous:true};
 const intro=message.match(/(?:我家(?:的)?|我的)([^，,。？?！!\s]{1,20}?)(?:是(?:一只)?(?:猫|狗)|今年|体重|出生|今天|现在|最近|昨天|已经)/);
 const named=message.match(/(?:名字叫|名字是|名叫|叫做|取名为)\s*[“"「]?([^，,。？?！!\s”"」]{1,20})/);
 const introduced=named?.[1]||intro?.[1];
 if(introduced&&!isGenericPetName(introduced)&&!valid.some(p=>p.name===introduced))return {id:null,ambiguous:false};
 if(hits.length===1)return {id:hits[0].id,ambiguous:false};
 if(/养(?:猫|狗|犬)|养犬|禁养/.test(message)&&!/(?:它|这只|这条|我家|我的)/.test(message))return {id:null,ambiguous:false};
 if(/(?:另一只|另外一只|换(?:一只|聊)|不是它)/.test(message))return {id:null,ambiguous:true};
 const animal=message.match(/(?:我家(?:的)?|我的|问的是|说的是).{0,4}?(猫|狗)/)?.[1];
 if(animal&&profile?.species&&animal!==profile.species)return {id:null,ambiguous:true};
 return {id:valid.some(p=>p.id===currentId)?currentId:null,ambiguous:false};
}
export function preparePetMemory(answer,message,pets,currentId,allowBinding=true,history=[]){
 const parsed=parseExtraction(answer,message);
 parsed.operations=parsed.operations.filter(op=>{
  if(thirdParty.test(message))return false;
  if(op.pet==='@current')return true;
  const pet=pets.find(p=>p.id===op.pet||p.name===op.pet);
  if(pet&&isGenericPetName(pet.name)&&pet.id!==currentId&&!explicitlyNamed(message,pet.name))return false;
  if(pet)return pet.id===currentId||mentioned(message,pet.name);
  if(uuid(op.pet))return false;
  return (ownPet.test(message)||((/^(?:它|这只|名字|叫)/.test(message.trim())||(message.trim()===op.pet&&/名字|叫什么|叫啥|name/i.test([...history].reverse().find(m=>m.role==='assistant')?.content||'')))&&history.some(m=>m.role==='user'&&ownPet.test(m.content))))&&(!isGenericPetName(op.pet)||explicitlyNamed(message,op.pet));
 });
 return {...parsed,current_pet:currentId||null,allow_binding:allowBinding};
}
// Old memory retries must use that turn's target, never a later conversation's pet.
export function memoryPetFromSnapshot(snapshot){
 if(snapshot&&Object.hasOwn(snapshot,'memory_pet_id'))return uuid(snapshot.memory_pet_id)?snapshot.memory_pet_id:null;
 try{const p=JSON.parse(snapshot?.variables?.petProfile||'null');return uuid(p?.id)?p.id:null}catch{return null}
}
