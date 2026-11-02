// Fast, deterministic topic summaries: no extra model call and no slicing the user's sentence.
export function summarizeTitle(value,hasImages=false){
 const text=String(value||'').replace(/https?:\/\/\S+/g,' ').replace(/<[^>]*>/g,' ');
 const animal=/猫|cat\b/i.test(text)&&/狗|犬|dog\b/i.test(text)?'猫狗':/猫|cat\b/i.test(text)?'猫咪':/狗|犬|dog\b/i.test(text)?'狗狗':'宠物';
 const topics=[[/驱虫|寄生虫|跳蚤|蜱虫|deworm/i,'驱虫'],[/疫苗|免疫|vaccine/i,'疫苗'],[/登记|牌照|办证|许可|禁养|法规|法律|可以养|能养/i,'饲养规定'],[/呕吐|拉稀|腹泻|软便|vomit/i,'肠胃健康'],[/掉毛|脱毛|皮肤|瘙痒|抓痒/i,'毛发与皮肤'],[/吃|粮|喂|饮食|食欲|营养|diet|food/i,'饮食'],[/绝育|发情/i,'绝育'],[/训练|乱叫|咬人|抓人|行为|随地|猫砂/i,'行为训练'],[/年龄|多大|生日|几岁/i,'年龄'],[/体重|胖|瘦|减肥/i,'体重管理'],[/品种|什么猫|什么狗|辨认/i,'品种观察'],[/呼吸|昏迷|抽搐|出血|误食|尿不出/i,'紧急健康咨询'],[/症状|生病|医院|医生|兽医|健康/i,'健康'],[/照顾|照护|护理|养护|日常/i,'日常照护']];
 const found=topics.filter(([re])=>re.test(text)).map(([,label])=>label);
 const place=(text.match(/(?:北京|上海|广州|深圳|香港|澳门|台北|成都|杭州|新加坡|伦敦|东京)/)||[])[0];
 const topic=found.length?found.slice(0,2).join('与'):(hasImages?'图片观察':'问题咨询');
 return (place&&found.includes('饲养规定')?place+' · ':'')+animal+topic;
}
