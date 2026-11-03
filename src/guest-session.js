import {ApiError} from './core.js';
export const GUEST_SESSION_SECONDS = 30 * 60;
const encoder = new TextEncoder();
function encode(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function decode(value){if(!/^[A-Za-z0-9_-]+$/.test(value))throw Error('encoding');return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0))}
async function key(env){
 const secret=env.GUEST_SESSION_SECRET||env.TURNSTILE_SECRET_KEY;
 if(!secret)throw new ApiError(503,'CHALLENGE_CONFIG_MISSING','访客验证暂不可用，请登录使用');
 // A separate purpose label prevents these signatures from being used for any other token.
 return crypto.subtle.importKey('raw',encoder.encode('petai:guest-session:v1:'+secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
export async function verifyTurnstile(request,env,token,expectedAction='guest_chat'){
 if(!env.TURNSTILE_SECRET_KEY)throw new ApiError(503,'CHALLENGE_CONFIG_MISSING','访客验证暂不可用，请登录使用');
 if(typeof token!=='string'||!token||token.length>2048)throw new ApiError(403,'CHALLENGE_REQUIRED','请完成人机验证');
 const form=new FormData();form.set('secret',env.TURNSTILE_SECRET_KEY);form.set('response',token);
 const ip=request.headers.get('CF-Connecting-IP');if(ip)form.set('remoteip',ip);
 let verdict;
 try{
  const result=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:form,signal:AbortSignal.timeout(10000)});
  if(!result.ok)throw Error('verify unavailable');verdict=await result.json();
 }catch{throw new ApiError(502,'CHALLENGE_UNAVAILABLE','验证服务暂不可用，请稍后重试')}
 const hosts=(env.TURNSTILE_HOSTNAMES||'').split(',').map(x=>x.trim()).filter(Boolean);
 if(!verdict.success||!hosts.includes(verdict.hostname)||verdict.action!==expectedAction)throw new ApiError(403,'CHALLENGE_FAILED','人机验证失败，请重新验证');
}
export async function issueGuestSession(env,origin,now=Date.now(),pageSession=false){
 const iat=Math.floor(now/1000),exp=iat+GUEST_SESSION_SECONDS;
 const claims=pageSession?{v:2,purpose:'petai-guest-page',origin,iat,nonce:crypto.randomUUID()}:{v:1,purpose:'petai-guest-chat',origin,iat,exp,nonce:crypto.randomUUID()};
 const payload=encode(encoder.encode(JSON.stringify(claims)));
 const signature=encode(new Uint8Array(await crypto.subtle.sign('HMAC',await key(env),encoder.encode(payload))));
 return pageSession?{guest_session_token:payload+'.'+signature,session_scope:'page'}:{guest_session_token:payload+'.'+signature,expires_at:new Date(exp*1000).toISOString()};
}
export async function verifyGuestSession(env,origin,token,now=Date.now()){
 const invalid=()=>new ApiError(403,'GUEST_SESSION_INVALID','访客验证已失效，请重新验证');
 if(typeof token!=='string'||token.length>2048)throw invalid();
 let claims;
 try{
  const parts=token.split('.');if(parts.length!==2)throw Error('parts');
  if(!await crypto.subtle.verify('HMAC',await key(env),decode(parts[1]),encoder.encode(parts[0])))throw Error('signature');
  claims=JSON.parse(new TextDecoder().decode(decode(parts[0])));
 }catch(e){if(e instanceof ApiError&&e.status===503)throw e;throw invalid()}
 const seconds=Math.floor(now/1000);
 if(!claims||typeof claims!=='object'||claims.origin!==origin||typeof claims.nonce!=='string'||!Number.isInteger(claims.iat)||claims.iat>seconds+30)throw invalid();
 if(claims.v===2&&claims.purpose==='petai-guest-page'&&!('exp' in claims))return claims;
 if(claims.v!==1||claims.purpose!=='petai-guest-chat'||!Number.isInteger(claims.exp)||claims.exp-claims.iat!==GUEST_SESSION_SECONDS)throw invalid();
 if(claims.exp<=seconds)throw new ApiError(403,'GUEST_SESSION_EXPIRED','访客验证已到期，请重新验证后继续');
 return claims;
}
