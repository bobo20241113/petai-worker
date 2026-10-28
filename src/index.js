import {ApiError,id,text,jsonBody,hash,allowed,guestMessages,fastgpt,imageData} from './core.js';
import {DB,authenticate} from './db.js';
import {enqueue,runTurn,recover,petContext,syncMemory} from './jobs.js';
function response(data,status=200) { return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}}); }
async function rate(env,key) {
  if (!env.API_RATE_LIMITER) throw new ApiError(503,'RATE_CONFIG_MISSING','限流尚未配置');
  if (!(await env.API_RATE_LIMITER.limit({key})).success) throw new ApiError(429,'RATE_LIMITED','请求过于频繁，请稍后再试');
}
async function guest(request,env) {
  if (request.headers.has('authorization')) throw new ApiError(400,'WRONG_MODE','登录请求请使用云端会话接口');
  if (env.GUEST_ENABLED !== 'true') throw new ApiError(503,'GUEST_DISABLED','访客模式尚未开放');
  const origin = request.headers.get('origin');
  if (!origin || !allowed(env,origin)) throw new ApiError(403,'ORIGIN_DENIED','访客来源不允许');
  await rate(env,'guest:'+(request.headers.get('CF-Connecting-IP')||'unknown'));
  const body = await jsonBody(request,1500000);
  if (!env.TURNSTILE_SECRET_KEY || typeof body.turnstile_token !== 'string') throw new ApiError(403,'CHALLENGE_REQUIRED','请完成人机验证');
  const form = new FormData(); form.set('secret',env.TURNSTILE_SECRET_KEY); form.set('response',body.turnstile_token);
  const ip = request.headers.get('CF-Connecting-IP'); if(ip) form.set('remoteip',ip);
  const check = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:form,signal:AbortSignal.timeout(10000)});
  const verdict = await check.json();
  const hosts=(env.TURNSTILE_HOSTNAMES||'').split(',').map(x=>x.trim());
  if (!verdict.success || !hosts.includes(verdict.hostname) || verdict.action !== 'guest_chat') throw new ApiError(403,'CHALLENGE_FAILED','人机验证失败');
  try {
    const answer = await fastgpt(env,guestMessages(body),{petProfile:'',petRecords:'[]',clarificationState:'{}',memoryStatus:'{"mode":"guest","persistent":false}'});
    return response({answer,mode:'guest',persistent:false});
  } catch(e) { if(e instanceof ApiError) throw e; throw new ApiError(502,'UPSTREAM_FAILED','本次回答失败，访客对话未保存'); }
}
async function upload(db,env,user,body) {
  const conv = await db.own('conversations',user,id(body.conversation_id));
  const image = imageData(body.image); const mime=image.slice(5,image.indexOf(';')); const binary=atob(image.split(',')[1]);
  const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  if(bytes.length>1048576)throw new ApiError(413,'IMAGE_TOO_LARGE','压缩后的图片不能超过1MB');
  const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const png=bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10';
  const webp=new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';
  if (!((mime==='image/jpeg'&&jpg)||(mime==='image/png'&&png)||(mime==='image/webp'&&webp))) throw new ApiError(400,'INVALID_IMAGE','图片内容与类型不匹配');
  const attachment=crypto.randomUUID();const path=user+'/'+conv.id+'/'+attachment;
  // Metadata first means cron can clean failed/unreferenced uploads.
  await db.insert('attachments',{id:attachment,owner_id:user,conversation_id:conv.id,storage_path:path,mime,size:bytes.length});
  const key=env.SUPABASE_SECRET_KEY;const headers={apikey:key,'Content-Type':mime};
  if(!key.startsWith('sb_secret_'))headers.Authorization='Bearer '+key;
  const r=await fetch(env.SUPABASE_URL.replace(/\/$/,'')+'/storage/v1/object/petai-private/'+path,{method:'POST',headers,body:bytes,signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw new ApiError(502,'UPLOAD_FAILED','图片上传失败，请重新上传');
  return response({id:attachment},201);
}
export async function route(request,env,ctx) {
  const url=new URL(request.url);const p=url.pathname;const method=request.method;
  if(p==='/health'&&method==='GET')return response({ok:true,service:'petai-api',version:'1.0.0'});
  if(p==='/api/guest/chat'&&method==='POST')return guest(request,env);
  if(!p.startsWith('/api/'))throw new ApiError(404,'NOT_FOUND','接口不存在');
  const user=(await authenticate(request,env)).id;await rate(env,'user:'+user);const db=new DB(env);
  const list=async(table,query={})=>response(await db.rows(table,{...query,owner_id:'eq.'+user}));
  if(p==='/api/pets'&&method==='GET')return list('pets',{order:'created_at.asc',limit:'100'});
  let m;
  if((m=p.match(/^\/api\/pets\/([^/]+)$/))&&method==='GET')return response(await petContext(db,user,id(m[1])));
  if((m=p.match(/^\/api\/pets\/([^/]+)\/records$/))&&method==='GET'){
    await db.own('pets',user,id(m[1]));return list('pet_records',{pet_id:'eq.'+m[1],status:'eq.active',order:'created_at.desc',limit:'100'});
  }
  if((m=p.match(/^\/api\/(records|facts)\/([^/]+)$/))&&method==='DELETE'){
    const target=id(m[2]);return response(await db.rpc('petai_forget',{p_owner:user,p_id:target,p_kind:m[1]}));
  }
  if(p==='/api/conversations'&&method==='GET'){
    const query={order:'updated_at.desc,id.desc',limit:'30'};
    if(url.searchParams.has('before')){const date=new Date(url.searchParams.get('before'));if(Number.isNaN(+date))throw new ApiError(400,'INVALID_CURSOR','无效时间');query.updated_at='lt.'+date.toISOString();}
    return list('conversations',query);
  }
  if(p==='/api/conversations'&&method==='POST'){
    const b=await jsonBody(request);if(b.pet_id)await db.own('pets',user,id(b.pet_id));
    const rows=await db.insert('conversations',{owner_id:user,pet_id:b.pet_id||null,title:b.title?text(b.title,100):'新对话'});return response(rows[0],201);
  }
  if((m=p.match(/^\/api\/conversations\/([^/]+)$/))){
    const cid=id(m[1]);await db.own('conversations',user,cid);
    if(method==='GET')return response(await db.own('conversations',user,cid));
    if(method==='PATCH'){const b=await jsonBody(request);if('pet_id'in b)throw new ApiError(400,'READ_ONLY','已有会话不能更换关联对象，请新建会话');return response((await db.update('conversations',{id:'eq.'+cid,owner_id:'eq.'+user},{title:text(b.title,100),updated_at:new Date().toISOString()}))[0]);}
    if(method==='DELETE')return response(await db.rpc('petai_delete_conversation',{p_owner:user,p_conversation:cid}));
  }
  if((m=p.match(/^\/api\/conversations\/([^/]+)\/messages$/))&&method==='GET'){
    const cid=id(m[1]);await db.own('conversations',user,cid);const q={conversation_id:'eq.'+cid,order:'sequence.desc',limit:'50'};
    if(url.searchParams.has('before')){const before=url.searchParams.get('before');if(!/^\d{1,16}$/.test(before))throw new ApiError(400,'INVALID_CURSOR','无效游标');q.sequence='lt.'+before;}
    return list('messages',q);
  }
  if((m=p.match(/^\/api\/conversations\/([^/]+)\/turns$/))&&method==='POST'){
    const cid=id(m[1]);const b=await jsonBody(request);const input=text(b.text);
    const client=id(b.client_request_id);const attachment=b.attachment_id?id(b.attachment_id):null;
    if(attachment){const a=await db.own('attachments',user,attachment);if(a.conversation_id!==cid)throw new ApiError(404,'NOT_FOUND','附件不存在');}
    const turn=await db.rpc('petai_submit_turn',{p_owner:user,p_conversation:cid,p_request:client,p_text:input,p_attachment:attachment,p_hash:await hash(JSON.stringify({input,attachment})),p_daily_limit:Number(env.MAX_USER_TURNS_PER_DAY)||100});
    if(turn.status==='pending'){try{await enqueue(db,env,turn.id);}catch{/* cron replays outbox */}}
    return response({turn_id:turn.id,status:turn.status},202);
  }
  if((m=p.match(/^\/api\/turns\/([^/]+)$/))&&method==='GET'){
    const turn=await db.own('chat_turns',user,id(m[1]));const {context_snapshot,lease_token,...safe}=turn;return response(safe);
  }
  if((m=p.match(/^\/api\/turns\/([^/]+)\/(retry|cancel)$/))&&method==='POST'){
    const turn=id(m[1]);await db.own('chat_turns',user,turn);const b=await jsonBody(request);
    const action=m[2];const result=await db.rpc('petai_turn_action',{p_owner:user,p_turn:turn,p_action:action,p_accept_duplicate:b.accept_possible_duplicate===true});
    if(action==='retry')try{await enqueue(db,env,turn);}catch{/* durable retry */}
    return response(result,action==='retry'?202:200);
  }
  if((m=p.match(/^\/api\/turns\/([^/]+)\/sync-memory$/))&&method==='POST'){
    const tid=id(m[1]);await db.own('chat_turns',user,tid);
    await db.rpc('petai_request_memory_retry',{p_owner:user,p_turn:tid});
    try{await env.CHAT_QUEUE.send({turn_id:tid,memory_only:true});}catch{}
    return response({turn_id:tid,memory_status:'retry_pending'},202);
  }
  if(p==='/api/attachments'&&method==='POST')return upload(db,env,user,await jsonBody(request,1500000));
  if(p==='/api/export'&&method==='GET')return response(await db.rpc('petai_export',{p_owner:user}));
  if(p==='/api/account/data'&&method==='DELETE'){
    const b=await jsonBody(request);if(b.confirm!=='DELETE_MY_DATA')throw new ApiError(400,'CONFIRM_REQUIRED','请明确确认删除所有云端数据');
    return response(await db.rpc('petai_delete_data',{p_owner:user}));
  }
  throw new ApiError(404,'NOT_FOUND','接口不存在或不支持该操作；档案通过聊天自动更新');
}
export default {
  async fetch(request,env,ctx){
    const origin=request.headers.get('origin');let res;const rid=crypto.randomUUID();
    try{
      if(origin&&!allowed(env,origin))throw new ApiError(403,'ORIGIN_DENIED','请求来源未获允许');
      if(request.method==='OPTIONS')res=new Response(null,{status:204});else res=await route(request,env,ctx);
    }catch(e){res=response({error:{code:e instanceof ApiError?e.code:'INTERNAL_ERROR',message:e instanceof ApiError?e.message:'服务暂时不可用',request_id:rid}},e instanceof ApiError?e.status:500);}
    const headers=new Headers(res.headers);headers.set('X-Request-Id',rid);headers.set('Vary','Origin');headers.set('Cache-Control','no-store');
    if(origin&&allowed(env,origin)){headers.set('Access-Control-Allow-Origin',origin);headers.set('Access-Control-Allow-Headers','Authorization, Content-Type');headers.set('Access-Control-Allow-Methods','GET, POST, PATCH, DELETE, OPTIONS');}
    return new Response(res.body,{status:res.status,headers});
  },
  async queue(batch,env){for(const msg of batch.messages){try{if(!msg.body||typeof msg.body.turn_id!=='string'){msg.ack();continue;}id(msg.body.turn_id);if(msg.body.memory_only===true)await syncMemory(env,msg.body.turn_id);else await runTurn(env,msg.body.turn_id);msg.ack();}catch{msg.retry({delaySeconds:30});}}},
  async scheduled(event,env,ctx){ctx.waitUntil(recover(env));}
};
