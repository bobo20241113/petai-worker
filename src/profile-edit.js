import {ApiError,id,today} from './core.js';
export const EDIT_FIELDS=['name','species','age_note','birth_date','weight_kg','breed_description','sex','neutered','vaccine_note'];
export function validatePetEdit(b){
 const bad=()=>{throw new ApiError(400,'INVALID_PROFILE','请检查字段内容、日期或体重格式')};
 if(!EDIT_FIELDS.includes(b.field)||!Number.isSafeInteger(b.version)||b.version<1)bad();
 let v=b.value;
 if(v!==null){
  if(b.field==='neutered'){if(typeof v!=='boolean')bad()}
  else if(b.field==='weight_kg'){if(typeof v!=='number'||!Number.isFinite(v)||v<=0||v>300)bad()}
  else{
   if(typeof v!=='string'||!v.trim()||v.length>(b.field==='vaccine_note'?800:180))bad();v=v.trim();
   if(b.field==='name'&&v.length>100)bad();
   if(b.field==='species'&&!['猫','狗','其他'].includes(v))bad();
   if(b.field==='sex'&&!['公','母','未知'].includes(v))bad();
   if(b.field==='birth_date'){
    if(!/^\d{4}-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/.test(v))bad();
    const d=v.length===7?v+'-01':v;if(!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d||d>today())bad();
   }
  }
 }
 return {field:b.field,value:v,version:b.version,issue_id:b.issue_id?id(b.issue_id):null};
}
