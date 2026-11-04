// Incremental SSE framing. Handles byte splits, CRLF/CR, comments and multiline data.
export async function* readSSE(response,{maxBytes=16777216}={}){
 if(!response.body)throw Error('STREAM_BODY_MISSING');
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',event='',data=[],bytes=0;
 const line=value=>{if(value.startsWith(':'))return;if(value.startsWith('event:'))event=value.slice(6).replace(/^ /,'');else if(value.startsWith('data:'))data.push(value.slice(5).replace(/^ /,''))};
 try{
  while(true){const item=await reader.read();if(item.done){buffer+=decoder.decode();break}bytes+=item.value.byteLength;if(bytes>maxBytes)throw Error('STREAM_BODY_LIMIT');buffer+=decoder.decode(item.value,{stream:true});
   let i;while((i=buffer.search(/[\r\n]/))>=0){if(buffer[i]==='\r'&&i===buffer.length-1)break;const value=buffer.slice(0,i),size=buffer[i]==='\r'&&buffer[i+1]==='\n'?2:1;buffer=buffer.slice(i+size);if(value===''){if(data.length)yield {event:event||'message',data:data.join('\n')};event='';data=[]}else line(value)}
  }
  if(buffer){for(const value of buffer.split(/\r\n|\r|\n/)){if(value===''){if(data.length)yield {event:event||'message',data:data.join('\n')};event='';data=[]}else line(value)}}
  if(data.length)yield {event:event||'message',data:data.join('\n')};
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
}
