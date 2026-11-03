import {fastgpt} from './core.js';
import {prepareSemanticMemory} from './semantic-memory.js';
// One bounded repair by the same semantic model. Never map natural phrases to facts here.
export async function extractSemanticMemory(env,input,pets,currentId=null,history=[]){
 let answer=await fastgpt(env,[{role:'user',content:JSON.stringify(input)}],{},true);
 try{return prepareSemanticMemory(answer,input.message,pets,currentId,history)}catch(error){
  if(error.message==='MEMORY_SCHEMA_V2_REQUIRED')throw error;
  const issues=error.issues||[{path:'$',code:error instanceof SyntaxError?'INVALID_JSON':'INVALID_SEMANTIC_STRUCTURE',expected:'complete schema_version=2 object with valid subjects, current-user evidence, typed operations and focus_ref'}];
  const repair={...input,repair_request:{attempt:1,invalid_output:answer.slice(0,24000),errors:issues,instruction:'上一次输出未通过校验。请根据原始message/history/pets重新检查，修正上述协议错误。不要更换用户事实、不要编造证据；区分物种与品种，测量记录使用record而不是新增fact字段。原话证据必须逐字摘录，不能改空格或标点。只输出修正后的完整v2 JSON；确实不明确就标记unresolved并给出澄清缺口。'}};
  answer=await fastgpt(env,[{role:'user',content:JSON.stringify(repair)}],{},true);
  return prepareSemanticMemory(answer,input.message,pets,currentId,history);
 }
}
