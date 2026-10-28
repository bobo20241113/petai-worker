// Context aids routing, never establishes pet facts, clinical findings or laws.
const PLACES=['香港','澳门','深圳','广州','北京','上海','天津','重庆','东莞','佛山','珠海','杭州','南京','苏州','成都','武汉','西安','长沙','厦门','福州','青岛','郑州','台北','台湾','新加坡','伦敦','东京'];
const PET=/(?:猫|狗|犬|宠物|养宠|狗牌|拉布拉多|金毛|柯基|边牧|柴犬|泰迪|萨摩耶|哈士奇|比熊|法斗|德牧|杜宾|罗威纳)/;
const LEGAL=/(?:禁养|禁止饲养|允许饲养|可以饲养|能饲养|能否饲养|能不能养|能否养|可以养|能养|可不可以养|准许|登记|狗牌|许可证|养犬证|办证|法规|规定|手续|跨境|入境|出境)/;
const NEW_TOPIC=/(?:天气|旅游|酒店|股票|房价|买房|电影|足球|篮球|笑话|编程|写代码|小孩|孩子|父母|养花)/;
function legalIntent(text){if(/适合|合适|小户型|住房|空间|没时间|上班|独居/.test(text)&&!/禁养|法规|规定|许可|登记|狗牌|跨境|手续/.test(text))return false;return LEGAL.test(text.replace(new RegExp('(?:在|于)('+PLACES.join('|')+')(?:市)?','g'),''))}
function regionFromFollowup(text){
 const s=text.trim().replace(/[?？。!！\s]+$/g,'');
 const plain=s.replace(/^在/,'');if(PLACES.includes(plain))return plain;
 const m=s.match(/^(?:那|那么|如果|要是)?(?:在|换成|换到)?(.{1,12}?)(?:呢|的话呢)$/);
 if(!m||NEW_TOPIC.test(s))return null;
 const value=m[1];return PLACES.includes(value)||/^[\u4e00-\u9fff]{1,10}(?:市|省|区|县|国)$/.test(value)?value:null;
}
function regionIn(text){
 const names=PLACES.join('|');
 const near=[...text.matchAll(new RegExp('('+names+')(?:市)?(?=能不能|可不可以|能否|是否|允许|可以|能|准许|饲养|养|办理|登记)','g'))];
 if(near.length)return near.at(-1)[1];
 const prep=[...text.matchAll(new RegExp('(?:在|到|于)('+names+')(?:市)?(?!犬|猫|狗)','g'))];
 if(prep.length)return prep.at(-1)[1];
 return PLACES.find(p=>new RegExp(p+'(?!犬|猫|狗)').test(text))||null;
}
function replaceRegion(text,old,region){
 const prep=new RegExp('((?:在|到|去|于|换成|换到)\\s*)'+old+'(?:市)?(?!犬|猫|狗)');
 if(prep.test(text))return text.replace(prep,(_,prefix)=>prefix+region);
 return text.replace(new RegExp(old+'(?:市)?(?!犬|猫|狗)'),region);
}
export function successfulHistory(rows,maxTurns=6){
 const groups=new Map();
 for(const m of rows){if(!m.turn_id||m.status!=='complete')continue;const g=groups.get(m.turn_id)||{};g[m.role]=m;groups.set(m.turn_id,g)}
 return [...groups.values()].filter(g=>g.user&&g.assistant&&!g.user.memory_excluded&&!g.assistant.memory_excluded)
 .sort((a,b)=>Number(a.user.sequence)-Number(b.user.sequence)).slice(-maxTurns).flatMap(g=>[g.user,g.assistant]);
}
export function conversationHints(input,history=[],profile=null){
 const current=String(input).trim();
 const recent=history.filter(m=>['user','assistant'].includes(m.role)&&typeof m.content==='string').slice(-12);
 const users=recent.filter(m=>m.role==='user').map(m=>m.content);
 const hasPet=PET.test(current)||users.some(t=>PET.test(t))||!!profile?.species;
 const region=regionFromFollowup(current);
 const lastLegal=[...users].reverse().find(t=>legalIntent(t)&&!NEW_TOPIC.test(t));
 let resolvedQuestion=current,lawIntent='no',clarifyFollowup='no';
 if(region&&lastLegal&&hasPet){
  const old=regionIn(lastLegal);
  resolvedQuestion=old?replaceRegion(lastLegal,old,region):`在${region}，${lastLegal}`;
  if(!PET.test(resolvedQuestion))resolvedQuestion=`承接前文宠物的饲养许可或登记咨询：${resolvedQuestion}`;
  lawIntent='yes';
 }else if(hasPet&&!NEW_TOPIC.test(current)&&legalIntent(current)&&(regionIn(current)||/禁养|登记|狗牌|许可证|养犬证|办证|法规|跨境|入境|出境/.test(current))){
  lawIntent='yes';
 }else if((region||(hasPet&&/^.{1,10}呢[?？。\s]*$/.test(current))||/^(?:那|这个|它|怎么办|可以吗|猫呢|狗呢|两天|不知道|没有)[?？。\s]*$/.test(current))&&!NEW_TOPIC.test(current)){
  clarifyFollowup='yes';
 }
 // A short reply may continue a normal care question, not necessarily the old law topic.
 // Only route law when the latest substantial question still concerns that topic.
 if(region&&lastLegal){
  const latest=[...users].reverse().find(t=>!regionFromFollowup(t)&&t.trim().length>4);
  if(latest&&latest!==lastLegal&&!legalIntent(latest)){resolvedQuestion=current;lawIntent='no';clarifyFollowup='yes'}
 }
 if(/呼吸困难|喘不上气|昏迷|失去意识|持续抽搐|严重出血|血流不止|疑似中毒|误食.{0,8}老鼠药|无法排尿|尿不出来/.test(current))lawIntent='no';
 return {resolvedQuestion,lawIntent,clarifyFollowup,conversationContext:JSON.stringify({
  currentQuestion:current,recentUserQuestions:users.slice(-6).map(t=>t.slice(0,800)),
  lastAssistantReply:recent.filter(m=>m.role==='assistant').at(-1)?.content.slice(0,1200)||'',
  note:'仅用于理解省略追问；历史助手回答不是主人事实或法律证据。新话题以本轮为准。'
 })};
}
