import {petSummaries} from './pet-identity.js';
// A persisted source-linked row proves a write; no trigger receipt is required.
export async function archiveChanges(db,owner,turnIds){
 if(!turnIds.length)return [];
 const messages=await db.rows('messages',{owner_id:'eq.'+owner,turn_id:'in.('+turnIds.join(',')+')',role:'eq.user',select:'id,turn_id',limit:'50'});
 if(!messages.length)return [];
 const byMessage=new Map(messages.map(m=>[m.id,m.turn_id])),source='in.('+messages.map(m=>m.id).join(',')+')';
 const query={owner_id:'eq.'+owner,source_message_id:source,status:'eq.active',limit:'1000'};
 const [facts,records,issues]=await Promise.all([
  db.rows('pet_facts',{...query,select:'pet_id,field,source_message_id'}),
  db.rows('pet_records',{...query,select:'pet_id,category,source_message_id'}),
  db.rows('memory_issues',{...query,status:'eq.open',select:'pet_id,field,source_message_id'})
 ]);
 const events=[...facts.map(r=>({...r,kind:'updated'})),...records.map(r=>({...r,kind:'updated',field:r.category==='weight'?'weight_kg':r.category==='vaccine'?'vaccine_note':r.category})),...issues.map(r=>({...r,kind:'review'}))].filter(r=>r.pet_id&&r.field&&byMessage.has(r.source_message_id));
 if(!events.length)return [];
 const ids=[...new Set(events.map(r=>r.pet_id))];
 const pets=await petSummaries(db,owner,await db.rows('pets',{owner_id:'eq.'+owner,id:'in.('+ids.join(',')+')',limit:'100'}));
 const byId=new Map(pets.map(p=>[p.id,p])),groups=new Map();
 for(const r of events){const pet=byId.get(r.pet_id);if(!pet)continue;const turn_id=byMessage.get(r.source_message_id),key=turn_id+':'+r.pet_id;
  if(!groups.has(key))groups.set(key,{...pet,turn_id,updated_fields:[],review_fields:[]});
  const fields=groups.get(key)[r.kind==='review'?'review_fields':'updated_fields'];if(!fields.includes(r.field))fields.push(r.field);
 }
 return [...groups.values()];
}
