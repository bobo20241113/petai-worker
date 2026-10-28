import {DB} from './db.js';
import {fastgpt, content, today} from './core.js';
import {parseExtraction,autoPetCandidate} from './memory.js';
import {signedImageUrl} from './images.js';
import {conversationHints,successfulHistory} from './conversation.js';
export async function enqueue(db, env, turnId) {
  await env.CHAT_QUEUE.send({turn_id:turnId});
  await db.update('outbox',{turn_id:'eq.'+turnId},{delivered_at:new Date().toISOString()});
}
export async function petContext(db, owner, petId) {
  if (!petId) return {profile:null,records:[],issues:[]};
  const pet = await db.own('pets',owner,petId);
  const [facts,records,issues] = await Promise.all([
    db.rows('pet_facts',{pet_id:'eq.'+petId,owner_id:'eq.'+owner,status:'eq.active',order:'created_at.asc',limit:'100'}),
    db.rows('pet_records',{pet_id:'eq.'+petId,owner_id:'eq.'+owner,status:'eq.active',order:'created_at.desc',limit:'30'}),
    db.rows('memory_issues',{pet_id:'eq.'+petId,owner_id:'eq.'+owner,status:'eq.open',limit:'10'})]);
  const profile = {id:pet.id,name:pet.name,source:'用户聊天陈述', ...Object.fromEntries(facts.map(f=>[f.field,f.value]))};
  const birth = profile.birth_date;
  if (typeof birth === 'string' && /^\d{4}-\d{2}/.test(birth)) {
    const [y,m] = birth.split('-').map(Number); const [cy,cm] = today().split('-').map(Number); const months=(cy-y)*12+cm-m;
    if (months >= 0) profile.computed_age=`约${Math.floor(months/12)}岁${months%12}个月（按出生年月计算）`;
  }
  return {profile, facts, records, issues};
}
export async function runTurn(env, turnId) {
  const db = new DB(env); const claimed = await db.rpc('petai_claim_turn',{p_turn:turnId});
  if (!claimed) return;
  const {owner_id:owner,conversation_id:conversationId,lease_token:lease} = claimed;
  try {
    let conv = await db.own('conversations',owner,conversationId);
    const current = (await db.rows('messages',{owner_id:'eq.'+owner,turn_id:'eq.'+turnId,role:'eq.user',limit:'1'}))[0]; if (!current) throw new Error('MESSAGE_MISSING');
    const rows = await db.rows('messages',{owner_id:'eq.'+owner,conversation_id:'eq.'+conversationId,sequence:'lt.'+current.sequence,order:'sequence.desc',limit:'24'});
    const history = successfulHistory(rows.filter(m=>m.turn_id!==turnId));
    const pets = await db.rows('pets',{owner_id:'eq.'+owner,order:'created_at.asc',limit:'100'});
    if (!conv.pet_id) {
      const candidate=autoPetCandidate(pets,current.content);
      if(candidate){await db.rpc('petai_bind_pet',{p_turn:turnId,p_lease:lease,p_pet:candidate.id});conv=await db.own('conversations',owner,conversationId);}
    }
    let ctx = await petContext(db,owner,conv.pet_id); let memoryStatus = 'saved';
    const priorState = await db.rows('conversation_states',{conversation_id:'eq.'+conversationId,owner_id:'eq.'+owner,limit:'1'});
    // Urgent handling must not wait for extraction; extraction can be retried explicitly.
    const urgent = /(?:呼吸困难|失去意识|昏迷|持续抽搐|血流不止|误食.{0,8}老鼠药|尿不出来)/.test(current.content);
    if (!claimed.memory_done && !urgent) {
      try {
        const answer = await fastgpt(env,[{role:'user',content:JSON.stringify({message:current.content,current_pet:conv.pet_id,pets:pets.map(p=>({id:p.id,name:p.name})),profile:ctx.profile,records:ctx.records.map(r=>({id:r.id,category:r.category,details:r.details})),history:history.slice(-8).map(m=>({role:m.role,content:m.content})),previous_state:priorState[0]?.state||{},received_at:current.created_at})}],{},true);
        const parsed = parseExtraction(answer,current.content);
        await db.rpc('petai_apply_memory',{p_turn:turnId,p_lease:lease,p_data:parsed});
      } catch {
        memoryStatus = 'pending';
        await db.rpc('petai_memory_pending',{p_turn:turnId,p_lease:lease});
      }
    } else if (urgent && !claimed.memory_done) { memoryStatus='pending'; await db.rpc('petai_memory_pending',{p_turn:turnId,p_lease:lease}); }
    else if (claimed.memory_status === 'pending') memoryStatus='pending';
    const fresh = await db.own('conversations',owner,conversationId);
    ctx = await petContext(db,owner,fresh.pet_id);
    const states = await db.rows('conversation_states',{conversation_id:'eq.'+conversationId,owner_id:'eq.'+owner,limit:'1'});
    let image = null;
    if (current.attachment_id) {
      const attachment = await db.own('attachments',owner,current.attachment_id);
      const signed = await db.request('/storage/v1/object/sign/petai-private/'+attachment.storage_path,{method:'POST',body:{expiresIn:600}});
      image = signedImageUrl(env.SUPABASE_URL,signed.signedURL,attachment.mime);
    }
    const messages = [...history.slice(-12).map(m=>({role:m.role,content:m.content})),{role:'user',content:content(current.content,image)}];
    const variables = {...conversationHints(current.content,history,ctx.profile),petProfile:ctx.profile?JSON.stringify(ctx.profile):'',petRecords:JSON.stringify(ctx.records),clarificationState:JSON.stringify(states[0]?.state||{}),currentDate:today(),memoryStatus:JSON.stringify({status:memoryStatus,issues:ctx.issues})};
    // Persist before calling upstream: a lost response is not automatically safe to repeat.
    const started = await db.rpc('petai_start_answer',{p_turn:turnId,p_lease:lease,p_context:{messages,variables,workflow:env.WORKFLOW_VERSION}});
    if (!started) return;
    let answer;
    try { answer = await fastgpt(env,messages,variables); }
    catch { await db.rpc('petai_fail_turn',{p_turn:turnId,p_lease:lease,p_status:'needs_review',p_error:'UPSTREAM_UNCERTAIN'}); return; }
    await db.rpc('petai_complete_turn',{p_turn:turnId,p_lease:lease,p_answer:answer});
  } catch {
    // The SQL function upgrades to needs_review if answer_started was already set.
    await db.rpc('petai_fail_turn',{p_turn:turnId,p_lease:lease,p_status:'failed',p_error:'PROCESSING_FAILED'});
  }
}
export async function recover(env) {
  const db = new DB(env);
  await db.rpc('petai_recover',{});
  const rows = await db.rows('outbox',{delivered_at:'is.null',order:'created_at.asc',limit:'30'});
  for (const row of rows) { try { await enqueue(db,env,row.turn_id); } catch { /* leave durable outbox pending */ } }
  const memoryRetries=await db.rows('chat_turns',{memory_status:'eq.retry_pending',status:'eq.completed',limit:'20'});
  for(const t of memoryRetries)try{await env.CHAT_QUEUE.send({turn_id:t.id,memory_only:true});}catch{}
  const removals = await db.rows('storage_deletions',{limit:'30'});
  for (const row of removals) {
    try {
      await db.request('/storage/v1/object/petai-private',{method:'DELETE',body:{prefixes:[row.storage_path]}});
      await db.request('/rest/v1/storage_deletions?id=eq.'+row.id,{method:'DELETE'});
    } catch { /* retry next cron */ }
  }
}

export async function syncMemory(env, turnId) {
  const db=new DB(env);const turn=await db.rpc('petai_claim_memory_retry',{p_turn:turnId});if(!turn)return;
  try {
    const conv=await db.own('conversations',turn.owner_id,turn.conversation_id);
    const current=(await db.rows('messages',{turn_id:'eq.'+turnId,role:'eq.user',owner_id:'eq.'+turn.owner_id,limit:'1'}))[0];
    const pets=await db.rows('pets',{owner_id:'eq.'+turn.owner_id,limit:'100'});
    const history=await db.rows('messages',{conversation_id:'eq.'+conv.id,owner_id:'eq.'+turn.owner_id,sequence:'lt.'+current.sequence,status:'eq.complete',memory_excluded:'eq.false',order:'sequence.desc',limit:'8'});
    const context=await petContext(db,turn.owner_id,conv.pet_id);
    const output=await fastgpt(env,[{role:'user',content:JSON.stringify({message:current.content,current_pet:conv.pet_id,pets:pets.map(p=>({id:p.id,name:p.name})),profile:context.profile,records:context.records.map(r=>({id:r.id,category:r.category,details:r.details})),history:successfulHistory(history,4).map(m=>({role:m.role,content:m.content})),received_at:current.created_at})}],{},true);
    await db.rpc('petai_apply_memory',{p_turn:turnId,p_lease:turn.lease_token,p_data:parseExtraction(output,current.content)});
  }catch{await db.rpc('petai_memory_pending',{p_turn:turnId,p_lease:turn.lease_token});}
}
