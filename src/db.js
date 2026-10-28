import {ApiError, boundedJson} from './core.js';
export class DB {
  constructor(env) { this.env = env; }
  async request(path, {method = 'GET', body, token, prefer} = {}) {
    const {SUPABASE_URL:url, SUPABASE_SECRET_KEY:key} = this.env;
    if (!url?.startsWith('https://') || !key) throw new ApiError(503, 'CONFIG_MISSING', '数据库尚未配置');
    const headers = {apikey:key, 'Content-Type':'application/json'};
    // New sb_secret keys aren't JWTs. Legacy service_role keys remain supported.
    if (token) headers.Authorization = 'Bearer ' + token;
    else if (!key.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + key;
    if (prefer) headers.Prefer = prefer;
    const response = await fetch(url.replace(/\/$/, '') + path, {method, headers, body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(15000)});
    if (!response.ok) {
      let err; try { err = await boundedJson(response, 16000); } catch { err = {}; }
      const known = {NOT_FOUND:[404,'NOT_FOUND','记录不存在'], CONFLICT:[409,'CONFLICT','数据已更新或会话有正在处理的问题'], QUOTA:[429,'QUOTA','今日请求次数已达上限']};
      const match = Object.entries(known).find(([key]) => err.message?.includes(key));
      if (match) throw new ApiError(...match[1]);
      throw new ApiError(503, 'DATABASE_ERROR', '数据库操作失败，请稍后重试');
    }
    return response.status === 204 ? null : boundedJson(response);
  }
  rpc(name, body) { return this.request('/rest/v1/rpc/' + name, {method:'POST',body}); }
  rows(table, query = {}) { return this.request('/rest/v1/' + table + '?' + new URLSearchParams(query)); }
  async own(table, user, record) {
    const rows = await this.rows(table, {id:'eq.'+record,owner_id:'eq.'+user,limit:'1'});
    if (!rows.length) throw new ApiError(404, 'NOT_FOUND', '记录不存在'); return rows[0];
  }
  insert(table, body) { return this.request('/rest/v1/'+table,{method:'POST',body,prefer:'return=representation'}); }
  update(table, query, body) { return this.request('/rest/v1/'+table+'?'+new URLSearchParams(query),{method:'PATCH',body,prefer:'return=representation'}); }
}
export async function authenticate(request, env) {
  const raw = request.headers.get('authorization');
  if (!raw || !/^Bearer \S+$/.test(raw)) throw new ApiError(401,'AUTH_REQUIRED','请先登录');
  const token = raw.slice(7); const db = new DB(env);
  try {
    const user = await db.request('/auth/v1/user', {token});
    if (!user.id) throw new Error('no user'); return user;
  } catch (e) { if (e.code === 'CONFIG_MISSING') throw e; throw new ApiError(401,'AUTH_EXPIRED','登录已失效，请重新登录'); }
}
