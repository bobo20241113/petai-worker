import test from 'node:test';
import assert from 'node:assert/strict';
import {imageObjectPath,signedImageUrl} from '../src/images.js';
import {parseExtraction,autoPetCandidate} from '../src/memory.js';
import {content} from '../src/core.js';
import worker from '../src/index.js';
function detectedImage(url){const u=new URL(url);const name=u.searchParams.get('filename')||u.pathname.split('/').at(-1);return /\.(?:jpg|jpeg|png|webp)$/i.test(name)}
test('new storage paths retain real image extension, unlike original UUID-only path',()=>{
 for(const [mime,ext]of [['image/jpeg','jpg'],['image/png','png'],['image/webp','webp']])assert.equal(imageObjectPath('u','c','a',mime),`u/c/a.${ext}`);
 assert.equal(detectedImage('https://x/object/sign/bucket/uuid?token=test'),false);
});
test('old UUID-only signed images get filename metadata; token and object path remain unchanged',()=>{
 const signed='/object/sign/petai-private/u/c/id?token=existing.jwt.token';
 const url=signedImageUrl('https://db.supabase.co',signed,'image/jpeg');const u=new URL(url);
 assert.equal(detectedImage(url),true);assert.equal(u.searchParams.get('filename'),'petai-image.jpg');assert.equal(u.searchParams.get('token'),'existing.jwt.token');assert.equal(u.pathname,'/storage/v1/object/sign/petai-private/u/c/id');
 const modern=signedImageUrl('https://db.supabase.co','/storage/v1/object/sign/petai-private/u/c/id.png?token=x','image/png');assert.equal(new URL(modern).pathname,'/storage/v1/object/sign/petai-private/u/c/id.png');assert.ok(detectedImage(modern));
});
test('image signing cannot be redirected to arbitrary host or unsupported MIME',()=>{
 for(const bad of ['https://evil/a.jpg','//evil/a.jpg','/storage/v1/object/sign/other/a.jpg'])assert.throws(()=>signedImageUrl('https://db',bad,'image/jpeg'));
 assert.throws(()=>imageObjectPath('u','c','a','image/svg+xml'));
});
test('model input keeps an actual image_url part rather than document text/file_url',()=>{
 const url=signedImageUrl('https://db','/object/sign/petai-private/a?token=x','image/jpeg');
 const input=content('这是什么猫',url);assert.equal(input[0].type,'text');assert.equal(input[1].type,'image_url');assert.equal(input[1].image_url.url,url);
});
test('upload route writes extension consistently to metadata and storage request',async()=>{
 const original=globalThis.fetch;const user='11111111-1111-4111-8111-111111111111',cid='22222222-2222-4222-8222-222222222222';let savedPath,storagePath;
 globalThis.fetch=async(url,init)=>{
  const u=new URL(url);
  if(u.pathname==='/auth/v1/user')return Response.json({id:user});
  if(u.pathname==='/rest/v1/conversations')return Response.json([{id:cid,owner_id:user}]);
  if(u.pathname==='/rest/v1/attachments'){savedPath=JSON.parse(init.body).storage_path;return Response.json([JSON.parse(init.body)]);}
  if(u.pathname.startsWith('/storage/v1/object/petai-private/')){storagePath=u.pathname.slice('/storage/v1/object/petai-private/'.length);return Response.json({Key:storagePath});}
  throw Error('Unexpected request');
 };
 try{
  const res=await worker.fetch(new Request('https://api/api/attachments',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({conversation_id:cid,image:'data:image/jpeg;base64,/9j/'})}),{SUPABASE_URL:'https://db',SUPABASE_SECRET_KEY:'sb_secret_test',API_RATE_LIMITER:{limit:async()=>({success:true})}},{});
  assert.equal(res.status,201);assert.ok(savedPath.endsWith('.jpg'));assert.equal(storagePath,savedPath);
 }finally{globalThis.fetch=original;}
});
test('pure image questions cannot create a pet named 猫, even from invalid model extraction',()=>{
 for(const message of ['这是什么猫','这是什么猫？','这是什么品种','图片是什么品种？']){
  const result=parseExtraction(JSON.stringify({operations:[{type:'fact',pet:'猫',field:'species',value:'猫',quote:'猫'}]}),message);assert.equal(result.operations.length,0,message);
 }
 const message='豆豆是猫';const result=parseExtraction(JSON.stringify({operations:[{type:'fact',pet:'@current',field:'name',value:'猫',quote:message}]}),message);assert.equal(result.operations.length,0);
});
test('explicit names and ordinary owner facts still work; old generic names never autobind',()=>{
 const message='我家豆豆是猫';assert.equal(parseExtraction(JSON.stringify({operations:[{type:'fact',pet:'豆豆',field:'species',value:'猫',quote:message}]}),message).operations.length,1);
 const special='它的名字叫 猫';assert.equal(parseExtraction(JSON.stringify({operations:[{type:'fact',pet:'猫',field:'name',value:'猫',quote:special}]}),special).operations.length,1);
 assert.equal(autoPetCandidate([{name:'猫',id:'bad'}],'这是什么猫'),null);
 assert.equal(autoPetCandidate([{name:'豆豆',id:'good'}],'豆豆多大了').id,'good');
 assert.equal(autoPetCandidate([{name:'猫',id:'bad'},{name:'豆豆',id:'good'}],'豆豆是什么猫'),null);
});
