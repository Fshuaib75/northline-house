import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import {build} from '../sourcing/engine.mjs';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync(new URL('../extension/seal.js',import.meta.url),'utf8');
const keys=await webcrypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
const jwk=await webcrypto.subtle.exportKey('jwk',keys.publicKey);
const cfg={repo:'example/test',branch:'main',token:'test-only-token'};
const item={t:'new',ref:'TEST',model:'Test ₦ shoe'};
const b64=s=>Buffer.from(s).toString('base64');
function runtime(fetch){const ctx=vm.createContext({crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,btoa,atob,fetch,setTimeout:fn=>fn()});vm.runInContext(source,ctx);return ctx.NLSeal;}
async function decrypt(batch){const raw=await webcrypto.subtle.decrypt({name:'RSA-OAEP'},keys.privateKey,Buffer.from(batch.k,'base64'));const aes=await webcrypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);return JSON.parse(new TextDecoder().decode(await webcrypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(batch.iv,'base64')},aes,Buffer.from(batch.ct,'base64'))));}
for(const status of [409,422])test(`encrypted append preserves concurrent batches after ${status}`,async()=>{
 let reads=0,puts=0;const writes=[];const existing={id:'existing',ct:'sealed'},concurrent={id:'concurrent',ct:'sealed2'};
 const seal=runtime(async(url,init)=>{
  assert.equal(init.headers.Authorization,'Bearer test-only-token');
  if(init.method==='PUT'){puts++;const body=JSON.parse(init.body);assert.equal(body.branch,'main');const inbox=JSON.parse(Buffer.from(body.content,'base64').toString());writes.push(inbox);assert.equal(body.sha,puts===1?'sha1':'sha2');return new Response(JSON.stringify(puts===1?{}:{commit:{sha:'saved'}}),{status:puts===1?status:200});}
  assert.ok(url.includes('?ref=main&'));
  const data=url.includes('inbox-pub.json')?{jwk}:{batches:++reads===1?[existing]:[existing,concurrent]};
  return new Response(JSON.stringify({sha:'sha'+reads,content:b64(JSON.stringify(data))}));
 });
 const result=await seal.sendToInbox(cfg,[item]);assert.equal(puts,2);assert.deepEqual(writes[1].batches.slice(0,2),[existing,concurrent]);assert.deepEqual(writes[0].batches.at(-1),writes[1].batches.at(-1));assert.deepEqual((await decrypt(result.batch)).items,[item]);assert.equal(result.waiting,3);
});
test('missing token makes no network request',async()=>{const api=runtime(()=>{throw Error('unexpected fetch');});await assert.rejects(api.sendToInbox({...cfg,token:''},[item]),/token/);});
test('authentication failure never writes',async()=>{let calls=0;const api=runtime(async()=>{calls++;return new Response('{}',{status:401});});await assert.rejects(api.sendToInbox(cfg,[item]),/token/);assert.equal(calls,1);});
test('repeated conflicts stop after three attempts',async()=>{let puts=0;const api=runtime(async(url,init)=>{if(init.method==='PUT'){puts++;return new Response('{}',{status:409});}return new Response(JSON.stringify({sha:'same',content:b64(JSON.stringify(url.includes('inbox-pub.json')?{jwk}:{batches:[]}))}));});await assert.rejects(api.sendToInbox(cfg,[item]),/kept changing/);assert.equal(puts,3);});
test('review template and embedded scripts parse with the shared seal code',()=>{const template=fs.readFileSync(new URL('../sourcing/review.html',import.meta.url),'utf8');assert.ok(template.includes('Send to review inbox'));assert.ok(template.includes('Export approved'));assert.ok(!/localStorage|sessionStorage/.test(template));const html=template.replace('/*INBOX_SEAL_CODE*/',()=>source);for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);});
function reviewRuntime(send){
 class Node{constructor(){this.value='';this.disabled=false;this.children=[];this.textContent='';}append(...n){this.children.push(...n);}prepend(...n){this.children.unshift(...n);}setAttribute(){}replaceChildren(){this.children=[];}addEventListener(){}showModal(){this.open=true;}close(){this.open=false;}}
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};
 const candidate=id=>({id,item:{ref:id,brand:'Test',model:'Test',sizes:['42'],imgs:[],img:'',colour:'Black',tl:10,kg:1},evidence:{title:'Test',observed_at:new Date().toISOString()},estimate:{price:100,profit:10,landed:80,agent:10},reasons:[],score:.5,method:'rules'});
 const data={candidates:[candidate('approved'),candidate('rejected')],eligible:2,model:'rules',sources:[]};
 const html=fs.readFileSync(new URL('../sourcing/review.html',import.meta.url),'utf8');const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1].replace('/*CANDIDATE_DATA*/null',JSON.stringify(data));
 const ctx=vm.createContext({document:{getElementById:get,createElement:()=>new Node()},crypto:webcrypto,NLSeal:{sendToInbox:send},setTimeout,URL,Blob});vm.runInContext(script,ctx);return {ctx,get,run:s=>vm.runInContext(s,ctx)};
}
test('button sends only approved items once and reports the destination',async()=>{
 let sent,resolve;const r=reviewRuntime(async(cfg,items)=>{sent={cfg,items};await new Promise(r=>resolve=r);});
 assert.equal(r.get('send').disabled,true);
 r.run("decisions.set('approved',{decision:'approve'});decisions.set('rejected',{decision:'reject'});draw()");
 await r.get('send').onclick();assert.equal(r.get('connection').open,true);assert.equal(sent,undefined);
 r.get('inboxRepo').value='example/test';r.get('inboxBranch').value='main';r.get('inboxToken').value='test-only-token';
 r.get('connectionForm').onsubmit({preventDefault(){}});
 assert.equal(r.get('inboxToken').value,'');assert.equal(r.get('send').disabled,true);assert.equal(sent.items.length,1);assert.equal(sent.items[0].ref,'approved');assert.equal(sent.cfg.branch,'main');
 resolve();await new Promise(r=>setImmediate(r));assert.match(r.get('inboxStatus').textContent,/Sent 1 item.*example\/test.*main.*Nothing was published/);assert.equal(r.get('send').disabled,true);
 r.get('forgetConnection').onclick();assert.equal(r.run('inboxConfig'),null);
});
test('failed delivery preserves approval, permits retry and keeps export enabled',async()=>{
 const r=reviewRuntime(async()=>{throw Error('sensitive response');});r.run("decisions.set('approved',{decision:'approve'});inboxConfig={repo:'example/test',branch:'main',token:'test'};draw()");await r.get('send').onclick();assert.match(r.get('inboxStatus').textContent,/Check To review before retrying/);assert.ok(!r.get('inboxStatus').textContent.includes('sensitive response'));assert.equal(r.get('send').disabled,false);assert.equal(r.get('export').disabled,false);assert.equal(r.run('sentIds.size'),0);
});

test('build embeds the shared seal implementation in a standalone review',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nl-inbox-test-'));try{fs.writeFileSync(path.join(dir,'derimod.json'),JSON.stringify({source:'derimod',base:'https://derimod.com.tr',currency:'TRY',observed_at:new Date().toISOString(),products:[],complete:false,errors:[]}));build(dir,path.join(dir,'out'));const html=fs.readFileSync(path.join(dir,'out/review.html'),'utf8');assert.ok(html.includes(source));assert.ok(!html.includes('/*INBOX_SEAL_CODE*/'));assert.ok(!html.includes('/*CANDIDATE_DATA*/'));for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);}finally{fs.rmSync(dir,{recursive:true,force:true});}});
