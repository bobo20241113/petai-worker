const facts=['name','species','birth_date','sex','neutered','breed_description','age_note'];
const categories=['weight','vaccine','deworming','diagnosis_report','care_plan'];
export function semanticIssues(raw,message){
 const errors=[],add=(path,code,expected)=>{if(errors.length<24)errors.push({path,code,expected})};
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return [{path:'$',code:'OBJECT_REQUIRED',expected:'v2 JSON object'}];
 if(!Array.isArray(raw.operations))return [{path:'operations',code:'ARRAY_REQUIRED',expected:'array'}];
 for(const [i,op]of raw.operations.entries()){
  const path='operations['+i+']';if(!op||typeof op!=='object'){add(path,'OBJECT_REQUIRED','operation');continue}
  if(typeof op.quote!=='string'||!op.quote||!message.includes(op.quote))add(path+'.quote','USER_QUOTE_REQUIRED','exact continuous text from original message, unchanged punctuation');
  if(op.type==='fact'){
   if(!facts.includes(op.field))add(path+'.field','FACT_FIELD_NOT_SUPPORTED',{fact_fields:facts,record_shape:{type:'record',pet:'subject ref',category:'weight',event_status:'completed',kg:'number in kilograms',description:'user fact',quote:'original user text',date_text:null}});
   if(op.field==='species'&&!['猫','狗','其他'].includes(op.value))add(path+'.value','SPECIES_ENUM_REQUIRED',{allowed:['猫','狗','其他'],breed_field:'breed_description',instruction:'Use original message semantics to separate species and breed; do not discard a known breed.'});
   if(op.field==='sex'&&!['公','母','未知'].includes(op.value))add(path+'.value','SEX_ENUM_REQUIRED',['公','母','未知']);
   if(op.field==='neutered'&&typeof op.value!=='boolean')add(path+'.value','BOOLEAN_REQUIRED','boolean');
   if(facts.includes(op.field)&&op.field!=='neutered'&&typeof op.value!=='string')add(path+'.value','STRING_REQUIRED','nonempty string');
  }else if(op.type==='record'){
   if(!categories.includes(op.category))add(path+'.category','CATEGORY_REQUIRED',categories);
   const expected=op.category==='care_plan'?'planned':'completed';if(op.event_status!==expected)add(path+'.event_status','EVENT_STATUS_REQUIRED',expected);
   if(op.category==='weight'&&(typeof op.kg!=='number'||!Number.isFinite(op.kg)||op.kg<=0||op.kg>300))add(path+'.kg','WEIGHT_NUMBER_REQUIRED','positive kilogram number <=300, converted from explicit user quantity');
   if(typeof op.description!=='string'||!op.description.trim())add(path+'.description','DESCRIPTION_REQUIRED','short user-provided fact');
  }else if(!['forget_fact','forget_record'].includes(op.type))add(path+'.type','OPERATION_TYPE_REQUIRED',['fact','record','forget_fact','forget_record']);
 }
 return errors;
}
