import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationHints,successfulHistory} from '../src/conversation.js';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';
const history=[{role:'user',content:'拉布拉多在深圳可以养吗'},{role:'assistant',content:'此前回答不构成法规依据'}];
test('location followup carries pet and licensing intent, not a bare city',()=>{
 for(const text of ['香港呢','那香港呢？','在香港呢','香港','上海呢']){
  const c=conversationHints(text,history);assert.equal(c.lawIntent,'yes');assert.ok(c.resolvedQuestion.includes(text.includes('上海')?'上海':'香港'));assert.ok(c.resolvedQuestion.includes('拉布拉多'));assert.ok(!c.resolvedQuestion.includes('深圳'));
 }
});
test('reported chain with pronoun preserves permit topic without inventing breed',()=>{
 const c=conversationHints('香港呢',[{role:'user',content:'这是什么狗'},{role:'assistant',content:'可能是拉布拉多，仅照片无法确认'},{role:'user',content:'在深圳可以养吗'},{role:'assistant',content:'先前回答'}]);
 assert.equal(c.lawIntent,'yes');assert.ok(c.resolvedQuestion.includes('香港'));assert.ok(c.resolvedQuestion.includes('宠物'));assert.ok(!c.resolvedQuestion.includes('拉布拉多'));
});
test('successive city changes still refer to the original user question',()=>{
 const c=conversationHints('上海呢',[...history,{role:'user',content:'香港呢'},{role:'assistant',content:'有关香港的答复'}]);assert.equal(c.lawIntent,'yes');assert.ok(c.resolvedQuestion.includes('上海'));assert.ok(!c.resolvedQuestion.includes('深圳'));
});
test('explicit unrelated new topic and newer health topic cannot inherit stale law routing',()=>{
 assert.equal(conversationHints('香港天气呢',history).lawIntent,'no');assert.equal(conversationHints('香港天气呢',history).clarifyFollowup,'no');
 const health=[...history,{role:'user',content:'豆豆呕吐怎么办'},{role:'assistant',content:'持续多久？'}];assert.equal(conversationHints('香港呢',health).lawIntent,'no');
 assert.equal(conversationHints('猫应该吃多少',history).lawIntent,'no');
});
test('no-history fragment asks clarification; current danger never uses hard law route',()=>{
 assert.equal(conversationHints('香港呢').clarifyFollowup,'yes');assert.equal(conversationHints('香港呢').lawIntent,'no');
 assert.equal(conversationHints('在深圳能养狗吗？它现在呼吸困难',history).lawIntent,'no');
});
test('database history contains complete successful pairs, excluding failures and forgotten sources',()=>{
 const rows=[{turn_id:'a',role:'assistant',content:'a',sequence:2,status:'complete'},{turn_id:'a',role:'user',content:'q',sequence:1,status:'complete'},
 {turn_id:'b',role:'user',sequence:3,status:'failed'},{turn_id:'c',role:'assistant',sequence:4,status:'complete'},
 {turn_id:'d',role:'user',sequence:5,status:'complete',memory_excluded:true},{turn_id:'d',role:'assistant',sequence:6,status:'complete'}];
 assert.deepEqual(successfulHistory(rows).map(x=>x.sequence),[1,2]);
});
test('workflow actually routes confirmed law hints before main classifier, and uses resolved classifier input',()=>{
 const f=JSON.parse(readFileSync(new URL('../fastgpt/chat-cloud.json',import.meta.url)));const nodes=Object.fromEntries(f.nodes.map(n=>[n.nodeId,n]));
 const val=(id,key)=>nodes[id].inputs.find(i=>i.key===key)?.value;
 assert.deepEqual(val('rvbo634w3AYj','userChatInput'),['viGpsYsOOUgV6xbI','answerText']);
 const rules=val('petcareLawIntentGateV18','ifElseList');assert.deepEqual(rules[0].list[0].variable,['VARIABLE_NODE_ID','lawIntent']);assert.equal(rules[0].list[0].condition,'equalTo');
 const branch=(id,p)=>f.edges.find(e=>e.source===id&&e.sourceHandle===id+'-source-'+p)?.target;
 assert.equal(branch('viGpsYsOOUgV6xbI','right'),'petcareLawIntentGateV18');assert.equal(branch('petcareLawIntentGateV18','IF'),'petcareLegalScopeV19');
 assert.equal(branch('petcareLawIntentGateV18','ELSE'),'rvbo634w3AYj');assert.equal(branch('petcareFollowupGateV18','IF'),'petcareClarifyFollowupV18');
 assert.deepEqual(val('petcareEntryRiskGuardV13','ifElseList')[0].list[0].variable,['workflowStartNodeId','userChatInput']);
});
test('workflow upgrader retains school visual model, knowledge bindings and private headers',()=>{
 const dir=mkdtempSync(join(tmpdir(),'petai-upgrade-'));
 try{
  const f=JSON.parse(readFileSync(new URL('../fastgpt/chat-cloud.json',import.meta.url)));const byId=Object.fromEntries(f.nodes.map(n=>[n.nodeId,n]));
  const visual=byId.petcareImageVision2026.inputs.find(i=>i.key==='model');visual.value='school/configured-vision';
  const datasets=byId.uhHSLcGctmw3yPZy.inputs.find(i=>i.key==='datasets');datasets.value=[{datasetId:'private-test-dataset'}];
  const header=f.nodes.flatMap(n=>n.inputs).find(i=>i.key==='system_header_secret');header.value={Authorization:'private-test-only'};
  const input=join(dir,'in.json'),output=join(dir,'out.json');writeFileSync(input,JSON.stringify(f));
  execFileSync(process.execPath,[new URL('../scripts/upgrade-workflow.mjs',import.meta.url).pathname,input,output]);const out=JSON.parse(readFileSync(output,'utf8'));
  assert.equal(out.nodes.find(n=>n.nodeId==='petcareImageVision2026').inputs.find(i=>i.key==='model').value,'school/configured-vision');
  assert.deepEqual(out.nodes.find(n=>n.nodeId==='uhHSLcGctmw3yPZy').inputs.find(i=>i.key==='datasets').value,[{datasetId:'private-test-dataset'}]);
  assert.equal(out.nodes.flatMap(n=>n.inputs).find(i=>i.key==='system_header_secret').value.Authorization,'private-test-only');
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('city substitution does not rename a Pekingese breed or replace purchase location',()=>{
 const a=conversationHints('香港呢',[{role:'user',content:'北京犬在北京可以养吗'}]);assert.equal(a.lawIntent,'yes');assert.ok(a.resolvedQuestion.includes('北京犬在香港'));
 const b=conversationHints('香港呢',[{role:'user',content:'深圳买的北京犬可以在上海养吗'}]);assert.ok(b.resolvedQuestion.includes('深圳买的北京犬'));assert.ok(b.resolvedQuestion.includes('在香港养'));
 assert.equal(conversationHints('北京犬能养吗').lawIntent,'no');
});
test('personal suitability questions are not forced into legal route just for mentioning a city',()=>{
 assert.equal(conversationHints('我在深圳住小户型，可以养拉布拉多吗').lawIntent,'no');
 assert.equal(conversationHints('深圳小户型养狗也需要登记吗').lawIntent,'yes');
});
test('upgrader removes retired regional branches from v18 without restoring stale references',()=>{
 const dir=mkdtempSync(join(tmpdir(),'petai-v19-upgrade-'));
 try{
  const input=new URL('../../6137-18.json',import.meta.url);const output=join(dir,'out.json');
  execFileSync(process.execPath,[new URL('../scripts/upgrade-workflow.mjs',import.meta.url).pathname,input.pathname,output]);
  const out=JSON.parse(readFileSync(output,'utf8'));const raw=JSON.stringify(out);
  assert.ok(!raw.includes('petcareHk'));assert.ok(!raw.includes('pets.gov.hk'));
  const query=out.nodes.find(n=>n.nodeId==='sMnGaCpKJevxBZHb').inputs.find(i=>i.key==='searchQuery').value;
  assert.deepEqual(query,['petcareOfficialQueryV5','answerText']);
  const read=out.nodes.find(n=>n.nodeId==='petcareReadOfficialV7').inputs.find(i=>i.key==='system_httpJsonBody').value;assert.match(read,/sourceUrl/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
