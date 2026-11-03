// Diagnostics contain codes and locations only, never user text, model JSON or keys.
export function memoryFailureDetails(error,stage,turnId){
 const safe=v=>typeof v==='string'&&/^[A-Za-z0-9_.\[\]-]{1,100}$/.test(v)?v:undefined;
 const code=safe(error?.code)||safe(error?.message)||safe(error?.name)||'UNKNOWN';
 return {event:'MEMORY_EXTRACTION_PENDING',turn_id:safe(turnId),stage,code,
  database_code:safe(error?.database_code),
  issues:Array.isArray(error?.issues)?error.issues.slice(0,24).map(i=>({path:safe(i.path),code:safe(i.code)})):[]};
}
export function logMemoryFailure(error,stage,turnId){console.warn('MEMORY_EXTRACTION_PENDING',JSON.stringify(memoryFailureDetails(error,stage,turnId)))}
