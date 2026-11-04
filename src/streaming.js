import {ApiError,boundedJson} from './core.js';
import {readSSE} from './sse.js';
export const sseHeaders={'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store, no-transform','X-Content-Type-Options':'nosniff'};
export const encodeEvent=(event,data)=>new TextEncoder().encode('event: '+event+'\ndata: '+JSON.stringify(data)+'\n\n');
export async function fastgptStream(env,messages,variables={},onText=async()=>{},signal){
 const target=env.FASTGPT_API_URL,key=env.FASTGPT_API_KEY;
 if(!target?.startsWith('https://')||!key)throw new ApiError(503,'CONFIG_MISSING','模型接口尚未配置');
 const timeout=AbortSignal.timeout(Math.min(120000,Number(env.FASTGPT_TIMEOUT_MS)||90000));
 const response=await fetch(target,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify({stream:true,detail:false,messages,variables}),signal:signal?AbortSignal.any([timeout,signal]):timeout});
 if(!response.ok)throw Error('UPSTREAM_HTTP_'+response.status);
 // Some gateways ignore stream=true. Accept a real buffered answer without inventing chunks or a second model request.
 if(!(response.headers.get('content-type')||'').includes('text/event-stream')){const data=await boundedJson(response,5242880),answer=data.choices?.[0]?.message?.content;if(typeof answer!=='string'||!answer.trim())throw Error('UPSTREAM_EMPTY');return answer}
 let answer='',answerBytes=0,finished=false,done=false;
 for await(const item of readSSE(response)){
  if(item.event==='error')throw Error('UPSTREAM_STREAM_ERROR');
  if(!['message','answer','fastAnswer'].includes(item.event))continue;
  if(item.data.trim()==='[DONE]'){done=true;break}
  let data;try{data=JSON.parse(item.data)}catch{throw Error('UPSTREAM_STREAM_JSON')}
  if(data?.error)throw Error('UPSTREAM_STREAM_ERROR');
  let delta=data?.choices?.[0]?.delta?.content;
  if(item.event==='fastAnswer'&&typeof data==='string')delta=data;
  if(delta!==undefined&&delta!==null&&typeof delta!=='string')throw Error('UPSTREAM_STREAM_CONTENT');
  if(typeof delta==='string'&&delta){answer+=delta;answerBytes+=new TextEncoder().encode(delta).byteLength;if(answerBytes>5242880)throw Error('UPSTREAM_BODY_LIMIT');await onText(delta,answer)}
  if(data?.choices?.[0]?.finish_reason)finished=true;
 }
 if(!done&&!finished)throw Error('UPSTREAM_STREAM_INCOMPLETE');
 if(!answer.trim())throw Error('UPSTREAM_EMPTY');return answer;
}
export function guestStream(env,messages,variables,signal){
 let cancelled=false;
 return new Response(new ReadableStream({async start(controller){
  const send=(e,d)=>{if(!cancelled)controller.enqueue(encodeEvent(e,d))};
  try{const answer=await fastgptStream(env,messages,variables,delta=>send('delta',{text:delta}),signal);send('done',{answer,mode:'guest',persistent:false,answered_at:new Date().toISOString()})}
  catch(error){console.warn('GUEST_STREAM_FAILED',/^[A-Z0-9_]+$/.test(error?.message||'')?error.message:error?.name||'UNKNOWN');send('error',{code:'UPSTREAM_FAILED',message:'本次输出中断，已显示内容可能不完整，请重试。'})}
  finally{if(!cancelled)controller.close()}
 },cancel(){cancelled=true}}),{headers:sseHeaders});
}
