import {boundedJson} from './core.js';
import {encodeEvent,sseHeaders} from './streaming.js';
export const streamStub=(env,id,attempt)=>env.ANSWER_STREAMS?.get(env.ANSWER_STREAMS.idFromName(id+':'+(attempt||0)));
export async function publishAnswer(stub,task){
 if(!stub)return;const response=await stub.fetch('https://stream.internal/update',{method:'POST',body:JSON.stringify(task)});
 if(!response.ok)throw Error('STREAM_PUBLISH_FAILED');
}
// Private binding-only object; all public subscriptions are authenticated in the Worker.
export class AnswerStream {
 constructor(ctx){this.ctx=ctx;this.snapshot=null;this.clients=new Set();this.savedAt=0;this.ready=ctx.blockConcurrencyWhile(async()=>{const meta=await ctx.storage.get('meta');if(meta){let text='';for(let i=0;i<meta.parts;i++)text+=await ctx.storage.get('part'+i)||'';this.snapshot={...meta,partial_answer:text,...(meta.status==='completed'?{answer:text}:{})}}})}
 async persist(){
  const s=this.snapshot,text=s.status==='completed'?s.answer||'':s.partial_answer||'',parts=[];
  for(let i=0;i<text.length;i+=16000)parts.push(text.slice(i,i+16000));
  const data={meta:{...s,answer:undefined,partial_answer:undefined,parts:parts.length}};parts.forEach((p,i)=>data['part'+i]=p);
  const entries=Object.entries(data);for(let i=0;i<entries.length;i+=64)await this.ctx.storage.put(Object.fromEntries(entries.slice(i,i+64)));
  await this.ctx.storage.setAlarm(Date.now()+10*60*1000);this.savedAt=Date.now();
 }
 async alarm(){await this.ctx.storage.deleteAll();this.snapshot=null;for(const client of this.clients)client.close()}
 async fetch(request){
  await this.ready;const path=new URL(request.url).pathname;
  if(path==='/update'&&request.method==='POST'){
   const data=await boundedJson(request,16777216);
   if(!['processing','completed','needs_review','failed','cancelled'].includes(data.status)||typeof data.id!=='string')return new Response('bad update',{status:400});
   if(this.snapshot&&['completed','cancelled'].includes(this.snapshot.status))return new Response(null,{status:204});
   this.snapshot={id:data.id,status:data.status,updated_at:data.updated_at||new Date().toISOString(),attempt:data.attempt||0,partial_answer:typeof data.partial_answer==='string'?data.partial_answer:this.snapshot?.partial_answer||'',answer:typeof data.answer==='string'?data.answer:null};
   if(Date.now()-this.savedAt>=1000||data.status!=='processing')await this.persist();
   for(const client of this.clients){try{client.controller.enqueue(encodeEvent('task',this.snapshot));if(data.status!=='processing')client.close()}catch{client.close()}}
   return new Response(null,{status:204});
  }
  if(path==='/subscribe'){
   let client;const object=this;
   return new Response(new ReadableStream({start(controller){
    client={controller,close(){clearTimeout(client.timer);object.clients.delete(client);try{controller.close()}catch{}}};
    object.clients.add(client);if(object.snapshot)controller.enqueue(encodeEvent('task',object.snapshot));
    if(object.snapshot&&object.snapshot.status!=='processing'){client.close();return}
    if(!object.snapshot)controller.enqueue(encodeEvent('task',{id:new URL(request.url).searchParams.get('id'),status:'processing',partial_answer:'',attempt:Number(new URL(request.url).searchParams.get('attempt'))||0}));
    controller.enqueue(new TextEncoder().encode(': connected\n\n'));client.timer=setTimeout(()=>client.close(),18000);
   },cancel(){client?.close()}}),{headers:sseHeaders});
  }
  return new Response('not found',{status:404});
 }
}
