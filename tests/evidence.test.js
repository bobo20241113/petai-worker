import test from 'node:test';
import assert from 'node:assert/strict';
import {auditLegalAnswer,publicUrl} from '../src/evidence.js';
const url='https://authority.gov/keeping';
const quote='本页说明目标地区猫的本地饲养管理要求，仅用于自动化测试。';
const scope={ready:true,jurisdiction:'目标地区',animal:'猫',matter:'local_keeping'};
const evidence={status:'MATCHED',source_kind:'web',url,official:true,jurisdiction:scope.jurisdiction,animal:scope.animal,matter:scope.matter,quote,facts:['测试资料说明本地饲养要求。']};
function fixture(e=evidence){return {responseData:[{nodeId:'petcareLegalScopeV19',textOutput:JSON.stringify(scope)},{nodeId:'sMnGaCpKJevxBZHb',httpResult:{results:[{url,title:'主管部门本地饲养说明',snippet:quote}]}},{nodeId:'petcareWebEvidenceV19',textOutput:JSON.stringify({status:'MATCHED',evidence:[e]})}]}}
const answer=`测试资料说明本地饲养要求。[来源](${url})`;
test('matched real search and exact quote allow citation',()=>assert.equal(auditLegalAnswer(answer,fixture()).answer,answer));
test('other jurisdictions, animals and matters cannot support target answer',()=>{for(const change of [{jurisdiction:'其他地区'},{animal:'狗'},{matter:'import'}])assert.match(auditLegalAnswer(answer,fixture({...evidence,...change})).answer,/暂时无法确认/)});
test('query links and generated answers are not search evidence',()=>{const data=fixture();data.responseData[1].httpResult={query:url,search_queries:[url],answer:quote,results:[],citations:[]};assert.match(auditLegalAnswer(answer,data).answer,/暂时无法确认/)});
test('invented quotes and nonofficial sources are rejected',()=>{for(const change of [{quote:'完全没有出现在本次搜索响应中的虚构证据文字。'},{official:false}])assert.match(auditLegalAnswer(answer,fixture({...evidence,...change})).answer,/暂时无法确认/)});
test('unapproved links discard generated conclusion but retain verified original excerpts',()=>{for(const link of ['https://other.go.jp/pets','https://authority.gov/another','https://authority.govother.go.jp/']){const r=auditLegalAnswer(`确定允许。[来源](${link})`,fixture());assert.equal(r.diagnostic.reason,'verified_excerpt');assert.ok(r.answer.includes(quote));assert.ok(r.answer.includes(url));assert.ok(!r.answer.includes('确定允许'));assert.ok(!r.answer.includes(link))}});
test('actual page read enriches only a URL returned by actual search',()=>{const data=fixture();data.responseData[1].httpResult.results[0].snippet='';data.responseData.push({nodeId:'petcareReadOfficialV7',body:{sourceUrl:url},httpResult:quote});assert.equal(auditLegalAnswer(answer,data).answer,answer);data.responseData.at(-1).body.sourceUrl='https://another.gov/page';assert.match(auditLegalAnswer(answer,data).answer,/暂时无法确认/)});
test('knowledge evidence needs actual retrieved document and quote',()=>{const data=fixture({...evidence,source_kind:'knowledge',source_id:'doc1'});data.responseData[1]={nodeId:'uhHSLcGctmw3yPZy',quoteList:[{id:'doc1',q:'本地饲养',a:quote}]};assert.equal(auditLegalAnswer('测试资料说明本地饲养要求。',data).answer,'测试资料说明本地饲养要求。');const rescue=auditLegalAnswer(answer,data);assert.equal(rescue.diagnostic.reason,'verified_excerpt');assert.ok(!rescue.answer.includes(url));data.responseData[1].quoteList=[];assert.match(auditLegalAnswer(answer,data).answer,/暂时无法确认/)});
test('missing information preserves clarification; no trace fails closed for legal intent',()=>{const data={responseData:[{nodeId:'petcareLegalScopeV19',textOutput:JSON.stringify({ready:false,missing:['所在城市']})}]};assert.equal(auditLegalAnswer('请问你所在的城市是哪里？',data).answer,'请问你所在的城市是哪里？');assert.match(auditLegalAnswer('确定允许。',{}, {lawIntent:'yes'}).answer,/暂时无法确认/)});
test('ordinary care is unaffected and known scope survives missing evidence',()=>{assert.equal(auditLegalAnswer('请补充上次护理时间。',{}).checked,false);const result=auditLegalAnswer(answer,{responseData:fixture().responseData.slice(0,1)}).answer;assert.match(result,/目标地区、猫/);assert.match(result,/已有|已说明/)});
test('public URL validation rejects internal destinations and malformed URLs',()=>{for(const u of ['http://authority.gov/','https://127.0.0.1/','https://localhost/','https://user:pass@authority.gov/','https://authority.gov:8443/','https://foo.internal/'])assert.equal(publicUrl(u),null);assert.equal(publicUrl(url+'#part'),url)});
test('invalid scope schema cannot authorize sources',()=>{const data=fixture();data.responseData[0].textOutput=JSON.stringify({...scope,matter:'unclear'});assert.match(auditLegalAnswer(answer,data).answer,/暂时无法确认/)});
test('FastGPT main adapter requests detail and returns only checked text; memory stays separate',async()=>{
 const {fastgpt}=await import('../src/core.js');const previous=globalThis.fetch;const requests=[];
 try{
  globalThis.fetch=async(_url,init)=>{const body=JSON.parse(init.body);requests.push(body);return Response.json({choices:[{message:{content:body.detail?answer:'{"operations":[]}'}}],...fixture()})};
  const env={FASTGPT_API_URL:'https://school.invalid/chat',FASTGPT_API_KEY:'test',MEMORY_API_URL:'https://school.invalid/extract',MEMORY_API_KEY:'test'};
  assert.equal(await fastgpt(env,[{role:'user',content:'测试地区的规定'}],{lawIntent:'yes'}),answer);
  assert.equal(await fastgpt(env,[{role:'user',content:'用户明确事实'}],{},true),'{"operations":[]}');
  assert.equal(requests[0].detail,true);assert.equal(requests[1].detail,false);
 }finally{globalThis.fetch=previous}
});
test('malformed optional trace entries fail closed without crashing',()=>{
 const data=fixture();data.responseData.push(null);data.responseData[2].textOutput=JSON.stringify({status:'MATCHED',evidence:[null]});assert.match(auditLegalAnswer(answer,data).answer,/暂时无法确认/);
 data.responseData[0]={nodeId:'petcareLegalScopeV19',nodeOutputs:[null],historyPreview:{invalid:true}};assert.match(auditLegalAnswer(answer,data).answer,/暂时无法确认/);
});
test('common real search envelopes and FastGPT history previews are supported',()=>{
 for(const raw of [{data:[{url,content:quote}]},{web:{results:[{url,description:quote}]}},{webPages:{value:[{url,name:'测试资料',snippet:quote}]}},{organic_results:[{link:url,snippet:quote}]},{response:{data:{results:[{url,raw_content:quote}]}}}]){
  const d=fixture();d.responseData[1].httpResult=JSON.stringify(raw);
  for(const n of [d.responseData[0],d.responseData[2]]){n.historyPreview=[{obj:'System',value:'not an output'},{obj:'AI',value:n.textOutput}];delete n.textOutput}
  assert.equal(auditLegalAnswer(answer,d).diagnostic.reason,'verified');
 }
});
test('URL-only search result can gain evidence from an actual JSON reader response',()=>{
 const d=fixture();d.responseData[1].httpResult={citations:[url]};
 d.responseData.push({nodeId:'petcareOfficialUrlV7',historyPreview:[{obj:'AI',value:url}]},{nodeId:'petcareReadOfficialV7',httpResult:{code:200,data:{content:quote}}});
 assert.equal(auditLegalAnswer(answer,d).diagnostic.reason,'verified');
 d.responseData.at(-1).httpResult={code:403,data:{content:quote}};assert.equal(auditLegalAnswer(answer,d).diagnostic.reason,'read_failed');
});
test('second search can recover after an actually empty first response',()=>{
 const d=fixture();const second=d.responseData[1].httpResult;d.responseData[1].httpResult={results:[],citations:[]};
 d.responseData[2].nodeId='petcareRetryEvidenceV20';d.responseData.push({nodeId:'petcareRetrySearchV20',httpResult:second});
 const r=auditLegalAnswer(answer,d);assert.equal(r.answer,answer);assert.equal(r.diagnostic.search_runs,2);assert.equal(r.diagnostic.matched_count,1);
});
test('legitimate parentheses and URL fragments do not cause accidental citation rejection',()=>{
 const u='https://authority.gov/article_(test)';const d=fixture({...evidence,url:u});d.responseData[1].httpResult={results:[{url:u,content:quote}]};
 const a=`[来源](${u}#section)`;assert.equal(auditLegalAnswer(a,d).answer,a);
});
test('CJK line wraps and full-width punctuation preserve quotation matching',()=>{
 const d=fixture();d.responseData[1].httpResult.results[0].snippet=quote.replace('目标地区猫','目\n标 地 区 猫');
 assert.equal(auditLegalAnswer(answer,d).diagnostic.reason,'verified');
});
test('fallback is specific to the missing stage and contains no irrelevant legal checklist',()=>{
 const d=fixture();d.responseData[1].httpResult={results:[]};
 const r=auditLegalAnswer(answer,d);assert.equal(r.diagnostic.reason,'search_empty');assert.match(r.answer,/搜索没有返回/);assert.ok(!r.answer.includes('费用、年龄或期限'));
 d.responseData[1].httpResult={results:[{url}]};assert.equal(auditLegalAnswer(answer,d).diagnostic.reason,'source_text_missing');
 d.responseData[1].httpResult={results:[{url,content:quote}]};d.responseData[2].textOutput='{"status":"INSUFFICIENT"}';assert.equal(auditLegalAnswer(answer,d).diagnostic.reason,'review_rejected');
 assert.deepEqual(Object.keys(r.diagnostic).sort(),['matched_count','reason','search_runs','source_count']);
});
test('search HTTP failures are distinguishable from successful empty responses',()=>{
 const d=fixture();d.responseData[1].httpResult={error:'fixture-upstream-failed'};
 const r=auditLegalAnswer(answer,d);assert.equal(r.diagnostic.reason,'search_failed');assert.match(r.answer,/搜索服务调用未成功/);assert.ok(!r.answer.includes('fixture-upstream-failed'));
});
test('diagnostic logging is opt-in, counts only, with no answer, query, URLs or keys',async()=>{
 const {fastgpt}=await import('../src/core.js');const oldFetch=globalThis.fetch,oldInfo=console.info;const lines=[];
 try{
  globalThis.fetch=async()=>Response.json({choices:[{message:{content:answer}}],...fixture()});console.info=v=>lines.push(v);
  const env={FASTGPT_API_URL:'https://school.invalid/chat',FASTGPT_API_KEY:'secret-fixture'};
  await fastgpt(env,[{role:'user',content:'private-fixture-question'}],{lawIntent:'yes'});assert.equal(lines.length,0);
  await fastgpt({...env,LEGAL_AUDIT_LOG:'true'},[{role:'user',content:'private-fixture-question'}],{lawIntent:'yes'});
  const log=JSON.parse(lines[0]);assert.equal(log.reason,'verified');assert.equal(log.search_runs,1);assert.equal(log.event,'legal_audit');
  for(const text of ['secret-fixture','private-fixture-question',quote,url])assert.ok(!lines[0].includes(text));
 }finally{globalThis.fetch=oldFetch;console.info=oldInfo}
});
