import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {webcrypto} from 'node:crypto';
import {scanCandidates} from '../sourcing/engine.mjs';
import {enqueueScan} from '../sourcing/queue.mjs';
const candidates=Array.from({length:700},(_,i)=>({id:'candidate-'+i,product_key:'style-'+Math.floor(i/2),item:{t:'new',ref:'TEST-'+i,brand:'One brand',cat:'shoes',tl:99999,model:'Glitter neon slide',colour:'Pink',sizes:['42'],img:'https://example.test/'+i,imgs:['https://example.test/'+i]}}));
test('all valid discoveries reach the inbox without price, preference, photo verdict or per-brand caps',()=>{
  const rows=scanCandidates(candidates,[],{'candidate-0':{verdict:'leave_out',people_photos:['https://example.test/0']}});
  assert.equal(rows.length,700);assert.equal(rows[0].img,'');assert.match(rows[0].review_notes,/product-only/);
  assert.equal(rows[0].grp,rows[1].grp);assert.equal(rows[0].source,'sourcing scan');
  assert.equal(scanCandidates([...candidates,candidates[0]],[{ref:'TEST-1'}]).length,699);
});
const keys=await webcrypto.subtle.generateKey({name:'RSA-OAEP',hash:'SHA-256',modulusLength:2048,publicExponent:new Uint8Array([1,0,1])},true,['encrypt','decrypt']);
const jwk=await webcrypto.subtle.exportKey('jwk',keys.publicKey);
async function decode(b){
  const raw=await webcrypto.subtle.decrypt({name:'RSA-OAEP'},keys.privateKey,Buffer.from(b.k,'base64'));
  const aes=await webcrypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
  return JSON.parse(new TextDecoder().decode(await webcrypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(b.iv,'base64')},aes,Buffer.from(b.ct,'base64'))));
}
test('sealed append preserves concurrent batches, retries conflicts and deduplicates the same run',async()=>{
  let remote={batches:[{id:'old',ct:'old'}]},puts=0;
  const api={getFile:async name=>({text:JSON.stringify(name==='inbox-pub.json'?{jwk}:remote),sha:'sha'}),putFile:async(name,text)=>{
    assert.equal(name,'inbox.json');puts++;
    assert.ok(!text.includes('99999')&&!text.includes('TEST-0'));
    if(puts===1){remote.batches.push({id:'concurrent',ct:'other'});return {conflict:true};}
    remote=JSON.parse(text);return {ok:true};
  }};
  const items=scanCandidates(candidates);assert.equal((await enqueueScan(items,api,'test-run')).queued,700);
  assert.equal(remote.batches.length,3);assert.equal(puts,2);
  const payload=await decode(remote.batches.at(-1));assert.deepEqual(payload.items,items);assert.equal(payload.source,'sourcing scan');
  assert.equal((await enqueueScan(items,api,'test-run')).alreadyQueued,true);assert.equal(puts,2);
});
test('no results does not read keys; missing setup and repeated conflict fail without replacing inbox',async()=>{
  assert.equal((await enqueueScan([],{getFile:()=>{throw Error('unexpected');}},'empty')).queued,0);
  await assert.rejects(enqueueScan([candidates[0].item],{getFile:async()=>({text:null})},'fail'),/not set up/);
  let puts=0;await assert.rejects(enqueueScan([candidates[0].item],{getFile:async n=>({text:JSON.stringify(n==='inbox-pub.json'?{jwk}:{batches:[]})}),putFile:async()=>{puts++;return {conflict:true};}},'fail'),/kept changing/);assert.equal(puts,3);
});
test('scan workflow has no plaintext artifacts or separate review; public output is counts only',()=>{
  const workflow=fs.readFileSync(new URL('../../.github/workflows/sourcing-scan.yml',import.meta.url),'utf8');
  assert.ok(!/upload-artifact|review\.html|candidates\.json|inputs\.limit/.test(workflow));
  assert.match(workflow,/tools\/sourcing\/queue.mjs/);assert.match(workflow,/contents: write/);
  assert.equal(fs.existsSync(new URL('../sourcing/review.html',import.meta.url)),false);
  const code=fs.readFileSync(new URL('../sourcing/queue.mjs',import.meta.url),'utf8');
  assert.match(code,/GITHUB_REF!=='refs\/heads\/main'/);assert.ok(!/writeFileSync/.test(code));
});
test('non-main scan is a dry run with a counts-only report and no candidate export',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nl-scan-test-'));
  try{
    fs.writeFileSync(path.join(dir,'derimod.json'),JSON.stringify({source:'derimod',base:'https://derimod.com.tr',currency:'TRY',observed_at:new Date().toISOString(),products:[],complete:true,errors:[]}));
    const text=execFileSync(process.execPath,['tools/sourcing/queue.mjs',dir],{cwd:fileURLToPath(new URL('../../',import.meta.url)),env:{...process.env,GITHUB_REF:'refs/heads/codex/test',GITHUB_TOKEN:''},encoding:'utf8'});
    const report=JSON.parse(text);assert.equal(report.dry,true);assert.equal(report.queued,0);
    assert.deepEqual(fs.readdirSync(dir),['derimod.json']);assert.ok(!/items|price|features|TEST-/i.test(text.replace('newItems','newCount')));
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
