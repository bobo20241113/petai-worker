// Identity evidence is separate from appearance and from the pet currently discussed.
export const GENERIC_LABELS=['猫','狗','猫咪','狗狗','宠物','动物','小猫','小狗','这只猫','这只狗','这只','它','未知','未命名','未命名宠物','cat','dog','pet','另一只猫','另一只狗','一只猫','一只狗','我的猫','我的狗','我家猫','我家狗'];
export const DESCRIPTION_PATTERN='^(?:(?:橘|橙|黄|白|黑|灰|蓝|棕|银|金|红|奶油|虎斑|条纹|斑点|玳瑁|三花|狸花|长毛|短毛|折耳|立耳|卷毛|无毛|中华田园|英国短毛|美国短毛|波斯|暹罗|布偶|缅因|异国短毛)+(?:猫|狗|犬)?|英短|美短|金毛|拉布拉多|哈士奇|柯基|边牧|柴犬|泰迪|萨摩耶|比熊|德牧|杜宾|罗威纳|.{1,16}(?:猫|犬|狗))$';
const description=new RegExp(DESCRIPTION_PATTERN,'i');
export function isDescriptionLabel(value){const n=String(value||'').trim();return !n||GENERIC_LABELS.includes(n.toLowerCase())||description.test(n)}
export function explicitPetName(message,name){
 const escaped=String(name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 return new RegExp('(?:名字(?:是|叫)|名叫|叫做|取名(?:为|叫)?|改名为|叫)\\s*[“"「]?'+escaped+'[”"」]?(?:[，,。!！?？;；\\s]|$)').test(message);
}
const owner=/(?:我(?:们)?有(?:(?:[一两二三四五六七八九十0-9]+只|只)[^，,。？?!！]{0,12}(?:猫|狗|宠物)|(?:猫|狗|宠物))|我(?:们)?家|我(?:们)?的(?!朋友|邻居|同事|客户)|我(?:们)?(?:最近|刚刚?|新|又)?(?:养|领养|收养)|自己养|\bmy (?:cat|dog|pet)\b|\bi (?:have|own|adopted)\b)/i;
export const thirdParty=/(?:朋友|邻居|同事|别人|他人|客户)(?:的|家|养|领养|收养)|\b(?:friend|neighbor|colleague)'?s\b/i;
export function deniesOwnership(text){return /(?:不是|并非|不属于|不再是).{0,6}我(?:们)?(?:家|的|养)|不是我(?:们)?的/.test(text)}
export function ownedStatement(text){return !deniesOwnership(text)&&owner.test(text)&&!thirdParty.test(text)&&!/(?:如果|假如|假设|想要|打算|准备|计划|考虑).{0,12}(?:我有|养|领养|买)/.test(text)}
export function namedEvidence(text,name){
 if(explicitPetName(text,name))return true;if(isDescriptionLabel(name))return false;
 return ['我家','我家的','我们家','我们家的','我的'].some(prefix=>{const pos=text.indexOf(prefix+name);return pos>=0&&/^(?:是|今年|已经|最近|今天|现在|体重|出生|[，,。！？?\s]|$)/.test(text.slice(pos+prefix.length+name.length))});
}
export function identityMeta(pet,facts=[]){
 const n=facts.find(f=>f.field==='name')?.value||pet.name;
 const confirmed=!!n&&n!=='未命名宠物'&&(pet.name_confirmed===true||facts.some(f=>namedEvidence(f.quote||'',String(n))));
 const species=facts.find(f=>f.field==='species')?.value;
 const owned=pet.ownership_confirmed===true||facts.some(f=>ownedStatement(f.quote||''));
 return {name:confirmed?String(n):'',name_confirmed:confirmed,ownership_confirmed:owned,default_eligible:owned,species:species||null,display_name:confirmed?String(n):species&&species!=='其他'?'未命名的'+species:'未命名宠物',legacy_label:!confirmed&&pet.name!=='未命名宠物'?pet.name:null};
}
export async function petSummaries(db,owner,pets=null){
 pets??=await db.rows('pets',{owner_id:'eq.'+owner,order:'created_at.asc',limit:'100'});
 if(!pets.length)return [];
 const facts=await db.rows('pet_facts',{owner_id:'eq.'+owner,pet_id:'in.('+pets.map(p=>p.id).join(',')+')',status:'eq.active',select:'pet_id,field,value,quote',limit:'1000'});
 return pets.map(p=>({...p,...identityMeta(p,facts.filter(f=>f.pet_id===p.id))}));
}
// A short affirmative can establish ownership only when it answers a clear,
// positive ownership question and the referenced animal can be identified.
export function ownershipReplyPet(message,history,pets,currentId=null){
 if(!/^(?:是的?|对的?|嗯|yes)[。！!\s]*$/i.test(message.trim()))return null;
 const question=[...history].reverse().find(m=>m.role==='assistant')?.content||'';
 if(!/(?:这只|它|这份档案).{0,20}(?:是你养|你自己养|属于你|你家的)/.test(question)||/不是|不属于|朋友|别人|邻居/.test(question))return null;
 if(currentId&&pets.some(p=>p.id===currentId))return currentId;
 const prior=[...history].reverse().find(m=>m.role==='user')?.content||'';
 const found=pets.filter(p=>p.name&&prior.includes(p.name));
 return found.length===1?found[0].id:pets.length===1?pets[0].id:null;
}
