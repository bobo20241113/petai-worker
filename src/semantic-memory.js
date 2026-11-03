import {semanticIssues} from './memory-validation.js';
import {parseExtraction} from './memory.js';
import {uuid} from './core.js';
const invalid=()=>{throw new Error('INVALID_SEMANTIC_MEMORY')};
export function prepareSemanticMemory(answer,message,pets,currentId=null,history=[]){
 const raw=JSON.parse(answer.trim().replace(/^```(?:json)?\s*\n?/,'').replace(/\n?```$/,''));
 if(!raw||typeof raw!=='object'||Array.isArray(raw))invalid();
 if(raw.schema_version!==2)throw new Error('MEMORY_SCHEMA_V2_REQUIRED');
 if(!['allowed','declined'].includes(raw.consent)||!Array.isArray(raw.subjects)||raw.subjects.length>8||!Array.isArray(raw.operations)||raw.operations.length>12)invalid();
 if(raw.consent==='declined')return {schema_version:2,operations:[],state:{},current_pet:currentId,allow_binding:false,focus_ref:null,owned_refs:[],confirmed_names:[]};
 const issues=semanticIssues(raw,message);if(issues.length){const error=new Error('MEMORY_VALIDATION_FAILED');error.issues=issues;throw error;}
 const refs=new Map(),owned=new Set(),names=new Set();let newCount=0;
 for(const s of raw.subjects){
  if(!s||typeof s.ref!=='string'||s.ref.length>100||refs.has(s.ref)||!['new','existing','unresolved'].includes(s.identity)||!['owned','responsible','third_party','unknown'].includes(s.relation)||!['certain','uncertain'].includes(s.certainty))invalid();
  const e=s.evidence,quote=e?.quote;if(typeof quote!=='string'||!quote.trim()||quote.length>1500||!['current','history'].includes(e.source))invalid();
  if(e.source==='current'?!message.includes(quote):!history.some(m=>m.role==='user'&&typeof m.content==='string'&&m.content.includes(quote)))invalid();
  let ref=null;
  if(s.identity==='new'){if(!/^new_[A-Za-z0-9_-]{1,24}$/.test(s.ref)||++newCount>4)invalid();ref='@new:'+s.ref;}
  if(s.identity==='existing'){if(!uuid(s.ref)||!pets.some(p=>p.id===s.ref))invalid();ref=s.ref;}
  const accepted=ref&&s.certainty==='certain'&&['owned','responsible'].includes(s.relation);
  if(s.name!==null&&s.name!==undefined&&(typeof s.name!=='string'||!s.name.trim()||s.name.length>100))invalid();
  refs.set(s.ref,{...s,ref:accepted?ref:null});if(accepted){owned.add(ref);if(s.name)names.add(s.name)}
 }
 const operations=[];
 for(const op of raw.operations){const s=refs.get(op.pet);if(!s)invalid();if(!s.ref)continue;
  if(op.field==='name'&&(typeof op.value!=='string'||!s.name||op.value!==s.name||typeof op.quote!=='string'||!op.quote.includes(op.value)))invalid();
  if(op.type?.startsWith('forget_')&&s.identity!=='existing')invalid();
  operations.push({...op,pet:s.ref});
 }
 const parsed=parseExtraction(JSON.stringify({operations,state:raw.state}),message,{allowUnnamed:true,semantic:true});
 if(raw.subjects.some(s=>s.identity==='unresolved'||s.certainty==='uncertain'||s.relation==='unknown')&&!parsed.state.missing?.length)parsed.state.missing=['请明确本次指的是哪只宠物，以及是否由你拥有或负责照护。'];
 if([...refs.values()].some(s=>s.identity==='new'&&s.ref&&!parsed.operations.some(o=>o.pet===s.ref))&&!parsed.state.missing?.length)parsed.state.missing=['请补充新宠物的种类或能区分对象的明确资料。'];
 let focus=null;if(raw.focus_ref!==null){const target=refs.get(raw.focus_ref);if(!target)invalid();focus=target.ref;}
 return {...parsed,schema_version:2,current_pet:currentId,focus_ref:focus,allow_binding:!!focus,owned_refs:[...owned],confirmed_names:[...names]};
}
