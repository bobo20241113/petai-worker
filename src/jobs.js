import {prepareSemanticMemory} from './semantic-memory.js';
import {DB} from './db.js';
import {fastgpt, content, today} from './core.js';
import {identityMeta,petSummaries} from './pet-identity.js';
import {memoryPetFromSnapshot} from './pet-matching.js';
import {signedImageUrl} from './images.js';
import {conversationHints,successfulHistory} from './conversation.js';
export async function enqueue(db, env, turnId) {
  await env.CHAT_QUEUE.send({turn_id:turnId});
  await db.update('outbox',{turn_id:'eq.'+turnId},{delivered_at:new Date().toISOString()});
}
export async function petContext(db, owner, petId) {
  if (!petId) return {profile:null,records:[],issues:[]};
  const pet = await db.own('pets',owner,petId);
  const [facts,records,issues,manual] = await Promise.all([
    db.rows('pet_facts',{pet_id:'eq.'+petId,owner_id:'eq.'+owner,status:'eq.active',order:'created_at.asc',limit:'100'}),
    db.rows('pet_records',{pet_id:'eq.'+petId,owner_id:'eq.'+owner,status:'eq.active',order:'created_at.desc',limit:'30'}),
    db.rows('memory_issues',{pet_id:'eq.'+petId,owner_id:'eq.'+owner,status:'eq.open',limit:'30'}),
    db.rows('pet_manual_fields',{pet_id:'eq.'+petId,owner_id:'eq.'+owner})]);
  const profile = {id:pet.id,name:pet.name,source:'用户聊天陈述', ...Object.fromEntries(facts.map(f=>[f.field,f.value]))};
  const meta=identityMeta(pet,facts);const nameConfirmed=meta.name_confirmed;
  if(!nameConfirmed)delete profile.name;
  for(const f of manual)profile[f.field]=f.value;
  if(manual.length){profile.source='用户聊天陈述与手动资料';profile.manually_confirmed_fields=manual.map(f=>f.field);profile.manual_policy='手动字段保持当前值，聊天中的不同信息需经用户在档案中确认；历史记录不代表已覆盖当前字段。'}
  const birth = profile.birth_date;
  if (typeof birth === 'string' && /^\d{4}-\d{2}/.test(birth)) {
    const [y,m] = birth.split('-').map(Number); const [cy,cm] = today().split('-').map(Number); const months=(cy-y)*12+cm-m;
    if (months >= 0) profile.computed_age=`约${Math.floor(months/12)}岁${months%12}个月（按出生年月计算）`;
  }
  return {profile, facts, records, issues, manual_fields:manual,version:pet.version,name_confirmed:manual.some(f=>f.field==='name')?!!profile.name:nameConfirmed,display_name:profile.name||meta.display_name,ownership_confirmed:meta.ownership_confirmed};
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
    const rawPets=await db.rows('pets',{owner_id:'eq.'+owner,order:'created_at.asc',limit:'100'});
    const pets=(await petSummaries(db,owner,rawPets)).map(p=>({...p,name:rawPets.find(raw=>raw.id===p.id).name}));
    let ctx=await petContext(db,owner,conv.pet_id);
    // Identity is resolved by the semantic extractor, never by message keywords.
    const match={id:pets.some(p=>p.id===conv.pet_id)?conv.pet_id:null,ambiguous:false};
    if((conv.pet_id||null)!==match.id){await db.rpc('petai_set_turn_pet',{p_turn:turnId,p_lease:lease,p_pet:match.id});conv=await db.own('conversations',owner,conversationId);ctx=await petContext(db,owner,conv.pet_id)}
    const memoryTarget=conv.pet_id||null;
    let memoryStatus='saved';
    const priorState = await db.rows('conversation_states',{conversation_id:'eq.'+conversationId,owner_id:'eq.'+owner,limit:'1'});
    // Urgent handling must not wait for extraction; Cron retries it in the background.
    const urgent = /(?:呼吸困难|失去意识|昏迷|持续抽搐|血流不止|误食.{0,8}老鼠药|尿不出来)/.test(current.content);
    if (!claimed.memory_done && !urgent) {
      try {
        let answer='';try{answer = await fastgpt(env,[{role:'user',content:JSON.stringify({message:current.content,current_pet:conv.pet_id,pets:pets.map(p=>({id:p.id,name:p.name_confirmed?p.name:null,label:p.display_name,species:p.species,breed_description:p.breed_description,ownership_confirmed:p.ownership_confirmed})),profile:ctx.profile,records:ctx.records.map(r=>({id:r.id,category:r.category,details:r.details})),history:history.slice(-8).map(m=>({role:m.role,content:m.content})),previous_state:priorState[0]?.state||{},received_at:current.created_at})}],{},true);}catch{/* No keyword fallback: unresolved semantics stays pending for retry. */}
        const parsed = prepareSemanticMemory(answer,current.content,pets,conv.pet_id,history);
        await db.rpc('petai_apply_memory',{p_turn:turnId,p_lease:lease,p_data:parsed});
      } catch(e) {
        console.warn('MEMORY_EXTRACTION_PENDING',e?.message==='MEMORY_SCHEMA_V2_REQUIRED'?'MEMORY_SCHEMA_V2_REQUIRED':'VALIDATION_OR_SERVICE_FAILURE');
        memoryStatus = 'pending';
        if(conv.pet_id)await db.rpc('petai_set_turn_pet',{p_turn:turnId,p_lease:lease,p_pet:null});
        await db.rpc('petai_memory_pending',{p_turn:turnId,p_lease:lease});
      }
    } else if (urgent && !claimed.memory_done) { memoryStatus='pending'; await db.rpc('petai_memory_pending',{p_turn:turnId,p_lease:lease}); }
    else if (claimed.memory_status === 'pending') memoryStatus='pending';
    const fresh = await db.own('conversations',owner,conversationId);
    ctx = await petContext(db,owner,fresh.pet_id);
    const states = await db.rows('conversation_states',{conversation_id:'eq.'+conversationId,owner_id:'eq.'+owner,limit:'1'});
    const image = [];
    for (const attachmentId of (current.attachment_ids?.length?current.attachment_ids:current.attachment_id?[current.attachment_id]:[])) {
      const attachment = await db.own('attachments',owner,attachmentId);
      if(attachment.conversation_id!==conversationId)throw new Error('ATTACHMENT_CONVERSATION_MISMATCH');
      const signed = await db.request('/storage/v1/object/sign/petai-private/'+attachment.storage_path,{method:'POST',body:{expiresIn:600}});
      image.push(signedImageUrl(env.SUPABASE_URL,signed.signedURL,attachment.mime));
    }
    const messages = [...history.slice(-12).map(m=>({role:m.role,content:m.content})),{role:'user',content:content(current.content,image)}];
    const variables = {...conversationHints(current.content,history,ctx.profile),petProfile:ctx.profile?JSON.stringify(ctx.profile):'',petRecords:JSON.stringify(ctx.records),clarificationState:JSON.stringify(states[0]?.state||{}),currentDate:today(),memoryStatus:JSON.stringify({status:memoryStatus,issues:ctx.issues})};
    // Persist before calling upstream: a lost response is not automatically safe to repeat.
    const started = await db.rpc('petai_start_answer',{p_turn:turnId,p_lease:lease,p_context:{messages,variables,memory_pet_id:memoryTarget,auto_binding_allowed:!match.ambiguous,workflow:env.WORKFLOW_VERSION}});
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
  // Retry only completed replies whose extraction is still pending. The existing RPC
  // atomically checks owner/status/attempts; duplicate Cron/queue deliveries are safe.
  if(env.MEMORY_API_URL?.startsWith('https://')&&env.MEMORY_API_KEY){
    const pendingMemory=await db.rows('chat_turns',{select:'id,owner_id',status:'eq.completed',memory_done:'eq.false',memory_status:'eq.pending',memory_attempts:'lt.3',updated_at:'lte.'+new Date(Date.now()-120000).toISOString(),order:'updated_at.asc',limit:'20'});
    for(const t of pendingMemory)try{await db.rpc('petai_request_memory_retry',{p_owner:t.owner_id,p_turn:t.id});}catch{/* another recovery run may have claimed it */}
    const memoryRetries=await db.rows('chat_turns',{memory_status:'eq.retry_pending',status:'eq.completed',limit:'20'});
    for(const t of memoryRetries)try{await env.CHAT_QUEUE.send({turn_id:t.id,memory_only:true});}catch{}
  }
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
    const rawPets=await db.rows('pets',{owner_id:'eq.'+turn.owner_id,limit:'100'});
    const pets=(await petSummaries(db,turn.owner_id,rawPets)).map(p=>({...p,name:rawPets.find(raw=>raw.id===p.id).name}));
    const history=await db.rows('messages',{conversation_id:'eq.'+conv.id,owner_id:'eq.'+turn.owner_id,sequence:'lt.'+current.sequence,status:'eq.complete',memory_excluded:'eq.false',order:'sequence.desc',limit:'8'});
    const target=memoryPetFromSnapshot(turn.context_snapshot);
    const context=await petContext(db,turn.owner_id,target);
    let output='';try{output=await fastgpt(env,[{role:'user',content:JSON.stringify({message:current.content,current_pet:target,pets:pets.map(p=>({id:p.id,name:p.name_confirmed?p.name:null,label:p.display_name,species:p.species,breed_description:p.breed_description,ownership_confirmed:p.ownership_confirmed})),profile:context.profile,records:context.records.map(r=>({id:r.id,category:r.category,details:r.details})),history:successfulHistory(history,4).map(m=>({role:m.role,content:m.content})),received_at:current.created_at})}],{},true);}catch{/* Retry only the semantic extractor, never guess a subject from keywords. */}
    await db.rpc('petai_apply_memory',{p_turn:turnId,p_lease:turn.lease_token,p_data:prepareSemanticMemory(output,current.content,pets,target,successfulHistory(history,4))});
  }catch{await db.rpc('petai_memory_pending',{p_turn:turnId,p_lease:turn.lease_token});}
}
