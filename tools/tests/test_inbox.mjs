import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
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
test('extension defaults point at the live inbox',()=>{
 for(const file of ['options.js','popup.js']){
  const code=fs.readFileSync(new URL('../extension/'+file,import.meta.url),'utf8');
  assert.match(code,/branch: "gh-pages"/);
  assert.match(code,/NLSeal\.inboxConfig\(/);
  new vm.Script(code);
 }
});
test('saved default main migrates once while custom destinations and credentials survive',()=>{
 const api=runtime(()=>{throw Error('unexpected network');});
 assert.equal(api.inboxConfig().branch,'gh-pages');
 const old={repo:'Fshuaib75/northline-house',branch:'main',token:'test-only'};
 const migrated=api.inboxConfig(old);
 assert.equal(migrated.branch,'gh-pages');assert.equal(migrated.token,old.token);assert.equal(old.branch,'main');
 assert.equal(migrated.inboxBranchVersion,1);
 assert.equal(api.inboxConfig({...migrated,branch:'main'}).branch,'main');
 assert.equal(api.inboxConfig({...old,repo:'example/custom'}).branch,'main');
 assert.equal(api.inboxConfig({...old,branch:'staging'}).branch,'staging');
});
test('default inbox delivery reads and writes gh-pages only',async()=>{
 let writes=0;
 const api=runtime(async(url,init)=>{
  if(init.method==='PUT'){
   writes++;const body=JSON.parse(init.body);assert.equal(body.branch,'gh-pages');
   return new Response(JSON.stringify({commit:{sha:'saved'}}));
  }
  assert.ok(url.includes('?ref=gh-pages&'));
  return new Response(JSON.stringify({sha:'test-sha',content:b64(JSON.stringify(url.includes('inbox-pub.json')?{jwk}:{batches:[]}))}));
 });
 await api.sendToInbox(api.inboxConfig({token:'test-only'}),[item]);assert.equal(writes,1);
});
