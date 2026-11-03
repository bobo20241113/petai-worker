import {petSummaries} from './pet-identity.js';
// Receipts are scoped to real writes. Resolved suggestions must never look pending.
export async function archiveChanges(db,owner,turnIds){
 if(!turnIds.length)return [];
 const receipts=await db.rows('archive_change_receipts',{owner_id:'eq.'+owner,turn_id:'in.('+turnIds.join(',')+')',limit:'1000',order:'created_at.asc'});
 if(!receipts.length)return [];
 const issueIds=[...new Set(receipts.filter(r=>r.kind==='review'&&r.issue_id).map(r=>r.issue_id))];
 const open=issueIds.length?await db.rows('memory_issues',{owner_id:'eq.'+owner,id:'in.('+issueIds.join(',')+')',status:'eq.open',select:'id',limit:'1000'}):[];
 const pending=new Set(open.map(i=>i.id));const ids=[...new Set(receipts.map(r=>r.pet_id))];
 const pets=await petSummaries(db,owner,await db.rows('pets',{owner_id:'eq.'+owner,id:'in.('+ids.join(',')+')',ownership_confirmed:'eq.true',limit:'100'}));
 const byId=new Map(pets.map(p=>[p.id,p])),groups=new Map();
 for(const r of receipts){const pet=byId.get(r.pet_id);if(!pet||r.kind==='review'&&!pending.has(r.issue_id))continue;const key=r.turn_id+':'+r.pet_id;
  if(!groups.has(key))groups.set(key,{...pet,turn_id:r.turn_id,updated_fields:[],review_fields:[]});
  const fields=groups.get(key)[r.kind==='review'?'review_fields':'updated_fields'];if(!fields.includes(r.field))fields.push(r.field);
 }
 return [...groups.values()];
}
