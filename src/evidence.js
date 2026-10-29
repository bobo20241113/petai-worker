// Citation provenance checks. No country's law, permit rule or default official page lives here.
// Semantic jurisdiction/subject checks are made by the scope + evidence-review nodes;
// this module verifies that their references really came from this run's retrieval.
const SEARCH='sMnGaCpKJevxBZHb', READ='petcareReadOfficialV7', KB='uhHSLcGctmw3yPZy';
const SCOPE='petcareLegalScopeV19', REVIEWS=['ubZfEsLsdZMRh8Dt','petcareWebEvidenceV19'];
export function publicUrl(value){
 if(typeof value!=='string'||value.length>4096||/\s|[<>"{}\\]/.test(value))return null;
 try{const u=new URL(value);const host=u.hostname.toLowerCase();
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
const norm=s=>String(s||'').replace(/\s+/g,' ').trim();
function sourceItems(response){
 const d=json(response);if(!d)return [];
 // Never recurse through query/search_queries/provider/usage/generated answer.
 const arrays=[d.results,d.citations,d.annotations,d.data?.results,d.data?.citations,d.data?.annotations].filter(Array.isArray);
 const out=[];
 for(const list of arrays)for(const item of list){
  if(typeof item==='string'){const url=publicUrl(item);if(url)out.push({url,text:'',title:''});continue}
  if(!item||typeof item!=='object')continue;
  const candidate=item.url_citation||item.source||item;
  const url=publicUrl(candidate.url||candidate.link||candidate.uri||item.url);if(!url)continue;
  out.push({url,title:norm(candidate.title||item.title),text:norm([candidate.title,item.title,candidate.snippet,item.snippet,candidate.content,item.content,candidate.text,item.text,candidate.description,item.description].filter(x=>typeof x==='string').join('\n'))});
 }
 return out;
}
function display(value,max=120){return norm(value).replace(/[\[\]()<>`]/g,'').slice(0,max)}
function fallback(scope,reason){
 const matter={local_keeping:'本地饲养规定',registration:'登记或牌照',import:'入境手续',export:'出境手续',transit:'过境手续',travel:'携带宠物出行',general:'宠物相关规定',unclear:'宠物相关规定'}[scope?.matter]||'宠物相关规定';
 const known=[scope?.jurisdiction,scope?.animal].filter(Boolean).map(x=>display(x));
 const lead=known.length?`你咨询的是${known.join('、')}的${matter}。`:'你咨询的是宠物相关规定。';
 return `${lead}\n\n${reason==='bad_link'?'本次答复的引用未能通过来源核对，因此暂不提供其中的具体规定。':'本次未取得足以核实该事项的匹配资料，暂时无法确认具体要求。'}不能据此判断允许或禁止，也不能给出确定的费用、年龄或期限。\n\n你可以稍后重试，或提供对应主管部门页面的文字供核对；已说明的地区和动物无需重复提供。`;
}
export function auditLegalAnswer(answer,data,variables={}){
 const trace=Array.isArray(data?.responseData)?data.responseData.filter(n=>n&&typeof n==='object'):[];
 const scopeNode=trace.find(n=>n.nodeId===SCOPE);const scope=json(nodeText(scopeNode));
 const entered=!!scopeNode||trace.some(n=>REVIEWS.includes(n.nodeId));
 // Ordinary care answers retain their normal behavior; no global law refusal.
 if(!entered&&variables.lawIntent!=='yes')return {answer,checked:false,allowedUrls:[]};
 // Clarification is not a failed search. Missing scope may ask known-aware questions,
 // but may not present invented links or numeric legal requirements.
 if(scope?.ready===false){
  if(/https?:\/\//i.test(answer))return {answer:'目前还需明确'+(Array.isArray(scope.missing)?scope.missing.map(x=>display(x,60)).join('、'):'适用地区、动物或具体事项')+'。请只补充这些尚未明确的信息，已有资料无需重复提供。',checked:true,allowedUrls:[]};
  return {answer,checked:true,allowedUrls:[]};
 }
 if(!scope||scope.ready!==true||typeof scope.jurisdiction!=='string'||!scope.jurisdiction.trim()||typeof scope.animal!=='string'||!scope.animal.trim()||!['local_keeping','registration','import','export','transit','travel','general'].includes(scope.matter))return {answer:fallback(null,'no_evidence'),checked:true,allowedUrls:[]};
 const sources=[];const quotes=new Map();
 for(const n of trace){
  if(n.nodeId===SEARCH)sources.push(...sourceItems(n.httpResult));
  if(n.nodeId===KB)for(const q of Array.isArray(n.quoteList)?n.quoteList:[]){if(!q||typeof q!=='object')continue;const key=String(q.id||q._id||'');if(key)quotes.set(key,norm([q.q,q.a,q.content,q.text].filter(x=>typeof x==='string').join('\n')))}
 }
 // An actual read can enrich a URL already returned by search; it can't create one.
 for(const n of trace.filter(n=>n.nodeId===READ)){
  const selected=publicUrl(n.body?.sourceUrl);const raw=typeof n.httpResult==='string'?n.httpResult:'';
  if(selected&&raw&&!/^(?:error|access denied|not found)/i.test(raw.trim()))for(const src of sources)if(src.url===selected)src.text=norm(src.text+'\n'+raw.slice(0,60000));
 }
 const allowed=new Set();let factualSupport=false;
 for(const n of trace.filter(n=>REVIEWS.includes(n.nodeId))){
  const review=json(nodeText(n));if(review?.status!=='MATCHED'||!Array.isArray(review.evidence))continue;
  for(const e of review.evidence){
   if(!e||typeof e!=='object'||e.status!=='MATCHED'||e.jurisdiction!==scope.jurisdiction||e.animal!==scope.animal||e.matter!==scope.matter)continue;
   const quote=norm(e.quote);if(quote.length<12||!Array.isArray(e.facts)||!e.facts.some(f=>typeof f==='string'&&f.trim()))continue;
   if(e.source_kind==='knowledge'){
    const text=quotes.get(String(e.source_id));if(text&&text.includes(quote))factualSupport=true;
   }else if(e.source_kind==='web'&&e.official===true){
    const url=publicUrl(e.url);const matches=sources.filter(s=>s.url===url&&s.text.includes(quote));if(matches.length){factualSupport=true;allowed.add(url)}
   }
  }
 }
 if(!factualSupport)return {answer:fallback(scope,'no_evidence'),checked:true,allowedUrls:[]};
 const links=[...answer.matchAll(/https?:\/\/[^\s<>"\[\]（）)]+/g)].map(m=>m[0].replace(/[，。；、]+$/g,''));
 if(links.some(url=>!publicUrl(url)||!allowed.has(publicUrl(url))))return {answer:fallback(scope,'bad_link'),checked:true,allowedUrls:[...allowed]};
 // If no URLs are allowed (e.g. a local uploaded knowledge document), no web link
 // is invented. The model may name the matched knowledge source without a URL.
 return {answer,checked:true,allowedUrls:[...allowed]};
}
