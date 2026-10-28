export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const uuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
export function id(s) { if (!uuid(s)) throw new ApiError(400, 'INVALID_ID', '无效的ID'); return s; }
export function text(s, max = 6000) {
  if (typeof s !== 'string' || !s.trim() || s.length > max) throw new ApiError(400, 'INVALID_TEXT', '文字为空或超出长度限制');
  return s.trim();
}
export function allowed(env, origin) { return (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).includes(origin); }
export async function jsonBody(req, max = 24000) {
  if (!(req.headers.get('content-type') || '').includes('application/json')) throw new ApiError(415, 'JSON_REQUIRED', '请使用JSON请求');
  if (Number(req.headers.get('content-length')) > max) throw new ApiError(413, 'BODY_TOO_LARGE', '请求太大');
  const r = req.body?.getReader(); if (!r) throw new ApiError(400, 'INVALID_JSON', '缺少请求体');
  let size = 0; const chunks = [];
  while (true) { const {value, done} = await r.read(); if (done) break; size += value.length; if (size > max) { await r.cancel(); throw new ApiError(413, 'BODY_TOO_LARGE', '请求太大'); } chunks.push(value); }
  const bytes = new Uint8Array(size); let off = 0; for (const c of chunks) { bytes.set(c, off); off += c.length; }
  try { const value=JSON.parse(new TextDecoder().decode(bytes)); if (!value || typeof value!=='object' || Array.isArray(value)) throw new Error('object required'); return value; } catch { throw new ApiError(400, 'INVALID_JSON', 'JSON格式错误'); }
}
export async function boundedJson(response, max = 2 * 1024 * 1024) {
  const reader = response.body.getReader(); let size = 0; let data = '';
  const decoder = new TextDecoder();
  while (true) { const {value, done} = await reader.read(); if (done) break; size += value.length; if (size > max) { await reader.cancel(); throw new Error('UPSTREAM_BODY_LIMIT'); } data += decoder.decode(value, {stream:true}); }
  return JSON.parse(data + decoder.decode());
}
export async function hash(value) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(x => x.toString(16).padStart(2, '0')).join(''); }
export function today() { return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Hong_Kong', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date()); }
export function imageData(value) {
  if (typeof value !== 'string' || value.length > 1400000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)) throw new ApiError(400, 'INVALID_IMAGE', '请提交压缩后的JPEG/PNG/WebP图片，最大约1MB');
  return value;
}
export function content(message, image) { return image ? [{type:'text',text:message},{type:'image_url',image_url:{url:image}}] : message; }
export function guestMessages(body) {
  const input = text(body.text); const history = body.history ?? [];
  if (!Array.isArray(history) || history.length > 12) throw new ApiError(400, 'INVALID_HISTORY', '临时历史过长');
  let size = input.length;
  const messages = history.map((m, i) => {
    if (!m || m.role !== (i % 2 ? 'assistant' : 'user')) throw new ApiError(400, 'INVALID_HISTORY', '历史必须是成对的用户与助手文字');
    const c = text(m.content, 6000); size += c.length; return {role:m.role, content:c};
  });
  if (history.length % 2 || size > 24000) throw new ApiError(400, 'INVALID_HISTORY', '历史不完整或过长');
  messages.push({role:'user',content:content(input, body.image ? imageData(body.image) : null)}); return messages;
}
export async function fastgpt(env, messages, variables = {}, memory = false) {
  const target = memory ? env.MEMORY_API_URL : env.FASTGPT_API_URL;
  const key = memory ? env.MEMORY_API_KEY : env.FASTGPT_API_KEY;
  if (!target || !key || !target.startsWith('https://')) throw new ApiError(503, 'CONFIG_MISSING', '模型接口尚未配置');
  const response = await fetch(target, {method:'POST', headers:{'Content-Type':'application/json',Authorization:'Bearer ' + key},
    body:JSON.stringify({stream:false,messages,variables,max_tokens: memory ? 2500 : 1400}), signal:AbortSignal.timeout(Math.min(120000, Number(env.FASTGPT_TIMEOUT_MS) || 90000))});
  if (!response.ok) throw new Error('UPSTREAM_HTTP_' + response.status);
  const data = await boundedJson(response); const answer = data.choices?.[0]?.message?.content;
  if (typeof answer !== 'string' || !answer.trim()) throw new Error('UPSTREAM_EMPTY');
  return answer.slice(0, 24000);
}
