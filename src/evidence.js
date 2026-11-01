// Workflow judges applicability; this adapter verifies actual retrieval provenance.
// No regional laws, permit requirements or default official pages live here.
const SEARCHES=new Set(['sMnGaCpKJevxBZHb','petcareRetrySearchV20']);
const READS=new Map([['petcareReadOfficialV7','petcareOfficialUrlV7'],['petcareRetryReadV20','petcareRetryUrlV20']]);
const KB='uhHSLcGctmw3yPZy',SCOPE='petcareLegalScopeV19';
const REVIEWS=new Set(['ubZfEsLsdZMRh8Dt','petcareWebEvidenceV19','petcareRetryEvidenceV20']);
export function publicUrl(value){
 if(typeof value!=='string'||value.length>4096||/\s|[<>"{}\\]/.test(value))return null;
 try{const u=new URL(value),host=u.hostname.toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!host.includes('.')||/^[\d.]+$/.test(host)||host.includes(':')||/(?:^|\.)(?:localhost|local|internal|invalid|test|example|onion)$/.test(host))return null;
  u.hash='';return u.href;
 }catch{return null}
}
function json(value){if(value&&typeof value==='object')return value;if(typeof value!=='string')return null;try{return JSON.parse(value.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''))}catch{return null}}
function nodeText(node){
 const outputs=node?.nodeOutputs;
 for(const value of [node?.textOutput,outputs?.answerText,Array.isArray(outputs)?outputs.find(o=>o&&(o.key==='answerText'||o.id==='answerText'))?.value:null])if(typeof value==='string'&&value.trim())return value;
 return (Array.isArray(node?.historyPreview)?node.historyPreview:[]).filter(x=>x&&(x.obj==='AI'||x.obj==='assistant')).at(-1)?.value||'';
}
const norm=s=>String(s||'').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/\s+/g,' ').trim();
const quoteNorm=s=>norm(s).replace(/([\u3400-\u9FFF])\s+(?=[\u3400-\u9FFF])/g,'$1');
function sourceItems(response){
 const d=json(response);if(!d)return [];
 const out=[];
 function item(v){
  if(typeof v==='string'){const url=publicUrl(v);if(url)out.push({url,title:'',text:''});return}
  if(!v||typeof v!=='object')return;
  const c=v.url_citation||v.source||v;
  const url=publicUrl(c.url||c.link||c.uri||v.url||v.link);if(!url)return;
  const title=norm(c.title||v.title||v.name);
  const text=quoteNorm([title,c.snippet,v.snippet,c.content,v.content,c.text,v.text,c.description,v.description,v.raw_content].filter(x=>typeof x==='string').join('\n'));
  out.push({url,title,text});
 }
 function walk(obj,depth=0){
  if(!obj||typeof obj!=='object'||depth>3)return;
  // Explicit provider envelopes only; no query/generated answer/history/usage traversal.
  if(Array.isArray(obj)){obj.slice(0,100).forEach(item);return}
  for(const key of ['results','citations','annotations','organic','organic_results','value'])if(Array.isArray(obj[key]))obj[key].slice(0,100).forEach(item);
  for(const key of ['data','web','webPages','response'])if(obj[key])walk(json(obj[key]),depth+1);
 }
 walk(d);return out;
}
function pageText(value){
 if(typeof value==='string'){
  const parsed=json(value);if(parsed&&typeof parsed==='object')return pageText(parsed);
  return /^(?:error|access denied|not found|unauthorized|forbidden)\b/i.test(value.trim())?'':value.slice(0,120000);
 }
 if(!value||typeof value!=='object'||value.error||Number(value.code)>=400||Number(value.status)>=400)return '';
 const d=value.data&&typeof value.data==='object'?value.data:value;
 return [d.content,d.markdown,d.text].filter(v=>typeof v==='string').join('\n').slice(0,120000);
}
const display=(v,max=120)=>norm(v).replace(/[\[\]()<>`]/g,'').slice(0,max);
function subject(scope){return [scope?.jurisdiction,scope?.animal].filter(Boolean).map(v=>display(v)).join('、')}
function fallback(scope,reason){
 const task={local_keeping:'本地饲养规定',registration:'是否需要登记及如何办理',import:'入境手续',export:'出境手续',transit:'过境手续',travel:'携带宠物出行要求',general:'宠物相关规定'}[scope?.matter]||'宠物相关规定';
 const lead=subject(scope)?`你问的是${subject(scope)}的${task}。`:'这次宠物法规咨询尚未完成核对。';
 const why={scope_unavailable:'这次未能读取完整的范围分析或执行明细',search_failed:'本次搜索服务调用未成功',search_empty:'本次搜索没有返回可核对的来源内容',source_text_missing:'本次只有来源线索，还没有取得可核对的正文或摘要',review_missing:'本次未能完成来源适用范围审查',review_rejected:'本次材料未能通过适用范围和原文核对',read_failed:'本次正文读取失败，现有摘要也不足以核对'}[reason]||'本次资料不足以核对该事项';
 return `${lead}\n\n${why}，暂时无法确认具体要求。你可以稍后重试，或提供对应主管部门页面的文字供核对；已说明的地区和动物无需重复提供。`;
}
function answerLinks(answer){
 const urls=[];
 const rest=answer.replace(/\[[^\]\n]*\]\((https?:\/\/(?:[^\s()]|\([^\s()]*\))+)\)/g,(_all,url)=>{urls.push(url);return ''});
 for(const match of rest.matchAll(/https?:\/\/[^\s<>"\[\]（）]+/g)){
  let url=match[0].replace(/[，。；、.,;!?]+$/g,'');
  while(url.endsWith(')')&&(url.match(/\)/g)||[]).length>(url.match(/\(/g)||[]).length)url=url.slice(0,-1);
  urls.push(url);
 }
 return urls;
}
function excerpts(scope,verified){
 const unique=[],seen=new Set();
 for(const s of verified){const key=s.url||s.source_id;if(seen.has(key))continue;seen.add(key);unique.push(s);if(unique.length===2)break}
 return `关于${subject(scope)||'你咨询的事项'}，本次核对到以下相关原文：\n\n`+unique.map(s=>{
  // Retain retrieved wording, never the unsupported generated answer or its URLs.
  const text=s.quote.slice(0,700).replace(/https?:\/\/[^\s]+/g,'[原文链接略]').replace(/[<>]/g,'');
  const cited=s.url?`\n\n[查看原始来源](${s.url})`:'\n\n来源：本次检索到的知识库资料';
  return `> ${text.replace(/\n/g,'\n> ')}`+cited;
 }).join('\n\n')+'\n\n以上为原文摘录；未获这些原文支持的细节暂不补充。';
}
export function auditLegalAnswer(answer,data,variables={}){
 const trace=Array.isArray(data?.responseData)?data.responseData.filter(n=>n&&typeof n==='object'):[];
 const scopeNode=trace.find(n=>n.nodeId===SCOPE),scope=json(nodeText(scopeNode));
 const entered=!!scopeNode||trace.some(n=>REVIEWS.has(n.nodeId));
 const diag={reason:'not_legal',search_runs:trace.filter(n=>SEARCHES.has(n.nodeId)).length,source_count:0,matched_count:0};
 const result=(text,reason,allowed=[],checked=true)=>({answer:text,checked,allowedUrls:allowed,diagnostic:{...diag,reason}});
 if(!entered&&variables.lawIntent!=='yes')return result(answer,'not_legal',[],false);
 if(scope?.ready===false){
  if(/https?:\/\//i.test(answer))return result('目前还需明确'+(Array.isArray(scope.missing)&&scope.missing.length?scope.missing.slice(0,2).map(x=>display(x,60)).join('、'):'适用地区、动物或具体事项')+'。请只补充尚未明确的信息，已有资料无需重复提供。','needs_clarification');
  return result(answer,'needs_clarification');
 }
 if(!scope||scope.ready!==true||typeof scope.jurisdiction!=='string'||!scope.jurisdiction.trim()||typeof scope.animal!=='string'||!scope.animal.trim()||!['local_keeping','registration','import','export','transit','travel','general'].includes(scope.matter))return result(fallback(null,'scope_unavailable'),'scope_unavailable');
 const sources=[],quotes=new Map();
 for(const n of trace){
  if(SEARCHES.has(n.nodeId))sources.push(...sourceItems(n.httpResult??n.nodeOutputs?.httpRawResponse));
  if(n.nodeId===KB)for(const q of Array.isArray(n.quoteList)?n.quoteList:[]){if(!q||typeof q!=='object')continue;const key=String(q.id||q._id||'');if(key)quotes.set(key,quoteNorm([q.q,q.a,q.content,q.text].filter(x=>typeof x==='string').join('\n')))}
 }
 let failedRead=false;
 for(const n of trace.filter(n=>READS.has(n.nodeId))){
  const body=json(n.body),selector=trace.find(x=>x.nodeId===READS.get(n.nodeId));
  const selected=publicUrl(body?.sourceUrl)||publicUrl(String(nodeText(selector)).trim());
  const text=pageText(n.httpResult??n.nodeOutputs?.httpRawResponse);
  if(!text)failedRead=true;
  if(selected&&text)for(const src of sources)if(src.url===selected)src.text=quoteNorm(src.text+'\n'+text);
 }
 diag.source_count=sources.length+quotes.size;
 const allowed=new Set(),verified=[];let reviewed=false;
 for(const n of trace.filter(n=>REVIEWS.has(n.nodeId))){
  const review=json(nodeText(n));if(review)reviewed=true;
  if(review?.status!=='MATCHED'||!Array.isArray(review.evidence))continue;
  for(const e of review.evidence){
   if(!e||typeof e!=='object'||e.status!=='MATCHED'||e.jurisdiction!==scope.jurisdiction||e.animal!==scope.animal||e.matter!==scope.matter)continue;
   if(typeof e.quote!=='string')continue;
   const quote=quoteNorm(e.quote);if(quote.length<12||!Array.isArray(e.facts)||!e.facts.some(f=>typeof f==='string'&&f.trim()))continue;
   if(e.source_kind==='knowledge'){
    const text=quotes.get(String(e.source_id));if(text&&text.includes(quote))verified.push({source_id:String(e.source_id),quote:e.quote});
   }else if(e.source_kind==='web'&&e.official===true){
    const url=publicUrl(e.url);if(url&&sources.some(s=>s.url===url&&s.text.includes(quote))){allowed.add(url);verified.push({url,quote:e.quote})}
   }
  }
 }
 diag.matched_count=verified.length;
 if(!verified.length){
  const searches=trace.filter(n=>SEARCHES.has(n.nodeId));
  const allSearchFailed=searches.length&&searches.every(n=>{const r=json(n.httpResult??n.nodeOutputs?.httpRawResponse);return !!(n.error||n.errorText||r?.error||Number(r?.status)>=400||Number(r?.code)>=400)});
  const reason=!diag.source_count?(allSearchFailed?'search_failed':diag.search_runs?'search_empty':'review_missing'):failedRead&&!sources.some(s=>s.text)?'read_failed':!quotes.size&&!sources.some(s=>s.text)?'source_text_missing':!reviewed?'review_missing':'review_rejected';
  return result(fallback(scope,reason),reason);
 }
 if(answerLinks(answer).some(url=>!publicUrl(url)||!allowed.has(publicUrl(url))))return result(excerpts(scope,verified),'verified_excerpt',[...allowed]);
 return result(answer,'verified',[...allowed]);
}
