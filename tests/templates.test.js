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
