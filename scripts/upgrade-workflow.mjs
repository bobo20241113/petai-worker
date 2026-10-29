// Preserve school-specific model, knowledge bindings and private HTTP settings.
// Output may contain credentials from YOUR export: never commit it to public GitHub.
import {readFile,writeFile} from 'node:fs/promises';
const [input,output]=process.argv.slice(2);
if(!input||!output){console.error('用法: node scripts/upgrade-workflow.mjs 当前导出.json 升级后.json');process.exit(1)}
const old=JSON.parse((await readFile(input,'utf8')).replace(/^\uFEFF/,''));
const template=JSON.parse(await readFile(new URL('../fastgpt/chat-cloud.json',import.meta.url),'utf8'));
const originals=new Map(old.nodes.map(n=>[n.nodeId,n]));const known=new Set(template.nodes.map(n=>n.nodeId));
const retired=new Set(['i4LYS9E0BvJ0Gy1C','petcareHkFetchV7','petcareHkBodyGateV7','petcareHkLiveV7','petcareHkReferenceV7','petcareSearchAnswerV7']);
if(old.nodes.some(n=>!known.has(n.nodeId)&&!retired.has(n.nodeId)))throw Error('当前导出含额外自定义节点，请手动合并，避免覆盖自定义流程。');
const repairedKeys=new Set(['systemPrompt','userChatInput','history','fileUrlList','ifElseList','searchQuery']);
for(const n of template.nodes){
 const prev=originals.get(n.nodeId);
 if(prev){
  if(prev.position&&!['petcareAskRegion','uhHSLcGctmw3yPZy','ubZfEsLsdZMRh8Dt','iso6ZEoKEE8RNhKi','petcareLawRagAnswer','sMnGaCpKJevxBZHb','petcareOfficialUrlV7','petcareUrlGateV7','petcareReadOfficialV7','sOUZOZrUtrZDbvrg','petcareLawFallback'].includes(n.nodeId))n.position=prev.position;
  const inputs=new Map((prev.inputs||[]).map(i=>[i.key,i]));
  for(const i of n.inputs||[]){const p=inputs.get(i.key);if(p&&!repairedKeys.has(i.key)&&!(n.nodeId==='petcareReadOfficialV7'&&i.key==='system_httpJsonBody')){if('value'in p&&p.value!==null)i.value=p.value;else delete i.value}}
 }
 if(n.flowNodeType==='chatNode'&&(!prev||prev.flowNodeType!=='chatNode')){
  const source=originals.get('viGpsYsOOUgV6xbI')||originals.get('xL2dEdlDVtFIYG6n');
  const model=source?.inputs.find(i=>i.key==='model');if(model?.value)n.inputs.find(i=>i.key==='model').value=model.value;
 }
}
const vars=new Map((old.chatConfig?.variables||[]).map(v=>[v.key,v]));
for(const v of template.chatConfig.variables)vars.set(v.key,v);
template.chatConfig={...template.chatConfig,...old.chatConfig,welcomeText:template.chatConfig.welcomeText,variables:[...vars.values()]};
await writeFile(output,JSON.stringify(template,null,2)+'\n',{flag:'wx'});
console.log('已写入升级工作流；保留原模型、知识库及HTTP配置。文件可能包含你原有的私钥，不要上传公开仓库。');
