// Legacy regression/migration helper only. The active queue uses semantic-memory.js.
import {ownedAnimal} from './pet-identity.js';
import {preparePetMemory} from './pet-matching.js';
// Conservative backup for explicit owner statements only; never infer from images or assistant replies.
export function explicitMemory(message,pets,currentId,allowBinding=true,history=[]){
 const empty=()=>preparePetMemory('{"operations":[]}',message,pets,currentId,allowBinding,history);
 if(message.length>1500||/(?:假如|假设|如果|打算|准备|计划|想要|不要保存|不要记录|别记|忘记|删除|不是我|并非)/.test(message))return empty();
 if(/两只|三只|多只|[2-9]只|还有|另一|另外|猫.{0,40}狗|狗.{0,40}猫/.test(message)||pets.filter(p=>p.name_confirmed&&message.includes(p.name)).length>1)return empty();
 const clauses=message.split(/[，,。；;！!\n]|(?=请问|想问|想知道)/).map(s=>s.trim()).filter(s=>s&&!/[?？]|要不要|是否|需要|应该|建议|吗|能否|不确定|可能|大概/.test(s));
 const declaration=clauses.join('，');
 const name=declaration.match(/(?:名字叫|名字是|名叫|叫做|取名为|叫)\s*[“"「]?([A-Za-z0-9\u4e00-\u9fa5]{1,12})[”"」]?(?=[，,。！!；;\s]|$)/)?.[1];
 const pet=currentId?'@current':name||'@new';const operations=[];
 let quote='';const fact=(field,value)=>operations.push({type:'fact',pet,field,value,quote,correction:/(?:更正|纠正|说错|改成|其实是)/.test(quote)});
 for(const clause of clauses){quote=clause;const message=clause;
 if(name&&message.includes(name)&&/(?:名字叫|名字是|名叫|叫做|取名为|叫)/.test(message))fact('name',name);
 const animal=ownedAnimal(message);if(animal){fact('species',animal.species);if(!['猫','狗','犬','兔子','仓鼠','鹦鹉'].includes(animal.description))fact('breed_description',animal.description);}
 const species=message.match(/我(?:们)?(?:家|的)(?:的)?(?:有)?(?:一只)?(猫|狗)|(?:是|养了?|有)(?:一只)?(猫|狗)(?=[，,。；;\s]|$)/);if(species&&!animal)fact('species',species[1]||species[2]);
 const breed=message.match(/品种(?:是|为|：|:)\s*([^，,。；;\n]{1,24})/);if(breed)fact('breed_description',breed[1].trim());
 const birth=message.match(/(?:出生日期(?:是|为|：|:)?\s*|出生于)(\d{4}[-年]\d{1,2}(?:[-月]\d{1,2}日?|月)?)/);
 if(birth){const parts=birth[1].match(/\d+/g);fact('birth_date',parts.map((v,i)=>i?v.padStart(2,'0'):v).join('-'));}
 const age=message.match(/(?:今年|现在|年龄(?:是|为|：|:)?)?\s*(\d+(?:\.\d+)?岁(?:半|\d+个月)?|\d+个月)/);if(age&&!birth)fact('age_note',age[1]);
 if(/(?:是|一只)?公(?:猫|狗)|性别(?:是|为|：|:)公/.test(message))fact('sex','公');else if(/(?:是|一只)?母(?:猫|狗)|性别(?:是|为|：|:)母/.test(message))fact('sex','母');
 if(/未绝育|没有绝育|还没绝育/.test(message))fact('neutered',false);else if(/已绝育|已经绝育|做过绝育/.test(message))fact('neutered',true);
 const weight=message.match(/(?:体重(?:是|为|：|:|到了?)?|(?:现在|目前|今天|昨天|前天)?重|称重(?:了|是|为|：|:)?|称(?:了|过)(?:一下|下)?(?:体?重)?|刚称(?:完)?(?:体?重)?)\s*(\d+(?:\.\d+)?)\s*(公斤|千克|kg|斤|克|g)(?=\s*(?:了(?:[，,。；;！!？?\s]|$)|[，,。；;！!？?]|$))/i);
 if(weight&&!/^(?:我(?:本人|自己)?|主人|孩子|我爸|我妈)(?:的|昨天|今天|前天|刚刚|刚才)?(?:体重|称|重)/.test(message)){const unit=weight[2].toLowerCase(),kg=Number(weight[1])*(unit==='斤'?.5:unit==='克'||unit==='g'?.001:1);
  if(kg>0&&kg<=300)operations.push({type:'record',pet,category:'weight',kg,description:'主人明确提供的体重',quote,date_text:message.match(/\d{4}-\d{2}-\d{2}|\d{4}年\d{1,2}月\d{1,2}日|昨天|今天|前天|刚刚|刚才/)?.[0]||null});
 }
 if(/(?:已(?:经)?接种|打过|打了|接种了|上次打疫苗是)/.test(message)&&/疫苗|猫三联|犬[四五六八]联|狂犬/.test(message)){
  const vaccine=message.match(/猫三联|犬[四五六八]联|狂犬(?:病)?疫苗|[^，,。；;\s]{1,12}疫苗/)?.[0];
  operations.push({type:'record',pet,category:'vaccine',description:message,quote:message,date_text:message.match(/\d{4}-\d{2}-\d{2}|(?:去年|今年|前年|\d{4}年)\d{1,2}月份?/)?.[0]||null});
 }
 }
 return preparePetMemory(JSON.stringify({operations}),message,pets,currentId,allowBinding,history);
}
export function reliableMemory(answer,message,pets,currentId,allowBinding=true,history=[]){
 let backup;try{backup=explicitMemory(message,pets,currentId,allowBinding,history)}catch{backup=null}
 let model;try{model=preparePetMemory(answer,message,pets,currentId,allowBinding,history)}catch(e){if(backup?.operations.length)return backup;throw e}
 if(!backup?.operations.length||model.operations.some(o=>o.type.startsWith('forget_')))return model;
 const canonical=backup.operations[0].pet,current=pets.find(p=>p.id===currentId);
 const normalized=model.operations.map(o=>({...o,pet:canonical==='@current'&&(o.pet===currentId||o.pet===current?.name)?'@current':!canonical.startsWith('@')&&o.pet==='@new'?canonical:o.pet}));
 const keys=new Set(backup.operations.map(o=>o.pet+':'+(o.field||o.category)));
 return {...model,operations:[...backup.operations,...normalized.filter(o=>!keys.has(o.pet+':'+(o.field||o.category)))].slice(0,12),owned_refs:[...new Set([...backup.owned_refs,...model.owned_refs])],confirmed_names:[...new Set([...backup.confirmed_names,...model.confirmed_names])]};
}
