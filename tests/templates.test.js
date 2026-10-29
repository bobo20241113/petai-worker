import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {EXTRACTION_PROMPT} from '../src/memory.js';
test('deployable templates have valid edges/references, declared cloud variables and no copied HTTP secrets',()=>{
 for(const file of ['chat-cloud.json','memory-extractor.json']){
  const f=JSON.parse(readFileSync(new URL('../fastgpt/'+file,import.meta.url)));
  const nodes=new Set(f.nodes.map(n=>n.nodeId));assert.equal(nodes.size,f.nodes.length);
  for(const edge of f.edges){assert.ok(nodes.has(edge.source));assert.ok(nodes.has(edge.target));}
  const vars=new Set(f.chatConfig.variables.map(v=>v.key));
  for(const n of f.nodes)for(const input of n.inputs||[]){
   assert.notEqual(input.value,null,'omit unbound values instead of null (FastGPT import bug)');
   if(input.key==='system_header_secret')assert.deepEqual(input.value,{});
   if(typeof input.value==='string')for(const match of input.value.matchAll(/\{\{\$([^.$]+)\.([^$]+)\$\}\}/g)){
    if(match[1]==='VARIABLE_NODE_ID')assert.ok(vars.has(match[2]),match[2]);else assert.ok(nodes.has(match[1]),match[1]);
   }
  }
  if(file==='memory-extractor.json')assert.equal(f.nodes.find(n=>n.flowNodeType==='chatNode').inputs.find(i=>i.key==='systemPrompt').value,EXTRACTION_PROMPT);
 }
});
test('GitHub button generator encodes root and subdirectory URLs',()=>{
 const script=new URL('../scripts/deploy-link.mjs',import.meta.url);
 const out=execFileSync(process.execPath,[script.pathname,'https://github.com/example/petai','main','petai-worker'],{encoding:'utf8'});
 assert.ok(out.includes(encodeURIComponent('https://github.com/example/petai/tree/main/petai-worker')));
});
test('generic legal workflow has no regional policy branches and distinguishes local keeping from import',()=>{
 const f=JSON.parse(readFileSync(new URL('../fastgpt/chat-cloud.json',import.meta.url)));const raw=JSON.stringify(f);
 for(const text of ['香港','深圳','pets.gov.hk','Group_IIIA','petcareHk','hkDogLicence'])assert.ok(!raw.includes(text),text);
 const scope=f.nodes.find(n=>n.nodeId==='petcareLegalScopeV19');const prompt=scope.inputs.find(i=>i.key==='systemPrompt').value;
 assert.match(prompt,/local_keeping/);assert.match(prompt,/品种里的地名不是动物来源地/);
 const target=(id,handle)=>f.edges.find(e=>e.source===id&&e.sourceHandle===id+'-source-'+handle)?.target;
 assert.equal(target('petcareScopeGateV19','IF'),'uhHSLcGctmw3yPZy');assert.equal(target('petcareScopeGateV19','ELSE'),'petcareAskRegion');
 assert.equal(target('iso6ZEoKEE8RNhKi','ELSE'),'petcareOfficialQueryV5');
});
