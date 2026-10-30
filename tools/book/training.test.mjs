import {setup} from './decisions.test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {train} from '../sourcing/ranking.mjs';
const html=fs.readFileSync(new URL('book.template.html',import.meta.url),'utf8');
const ranking=fs.readFileSync(new URL('../sourcing/ranking.mjs',import.meta.url),'utf8');
const RSA={name:'RSA-OAEP',hash:'SHA-256'};
const keys=await webcrypto.subtle.generateKey({...RSA,modulusLength:2048,publicExponent:new Uint8Array([1,0,1])},true,['encrypt','decrypt']);
const pub=await webcrypto.subtle.exportKey('jwk',keys.publicKey);
const rows=(n=100)=>Array.from({length:n},(_,i)=>({id:'private-ref-'+i,product_key:'group-'+i,decision:i%2?'approve':'reject',feature_version:1,features:[.5,.3,.5,.8,0,i%2,1-i%2,0]}));
async function harness(input=[],remote={}){
  const t=setup();t.c.RSA=RSA;t.c.INB.key=keys.privateKey;t.c.fetch=async()=>({json:async()=>({jwk:pub})});
  vm.runInContext(html.slice(html.indexOf('async function openBatch('),html.indexOf('// Ask for the book password')),t.c);
  vm.runInContext(html.slice(html.indexOf('async function inboxReseal('),html.indexOf('async function inboxApply(')),t.c);
  t.c.ghJson=async p=>({data:structuredClone(remote[p]??(p==='decisions.json'?{batches:[]}:null)),sha:p});
  t.c.ghPut=async(p,body)=>{t.writes.push(p);remote[p]=JSON.parse(Buffer.from(body,'base64').toString());};
  if(input.length)await (await t.c.decisionPrepare(input))();
  return {...t,remote};
}
test('standalone ranking port stays identical to canonical source and preserves all gates',()=>{
  assert.ok(html.includes(ranking.replaceAll('export ','')));
  const t=setup();
  for(const data of [rows(49),rows().map(r=>({...r,decision:'approve'})),rows().map(r=>({...r,product_key:'one-group'})),rows(),rows().map(r=>({...r,features:Array(8).fill(.5)}))]){
    t.c.input=data;
    assert.deepEqual(JSON.parse(JSON.stringify(t.run('BookRanking.train(input)'))),train(data));
  }
});
test('under threshold or class imbalance backs up privately but never publishes model',async()=>{
  for(const input of [rows(49),rows().map(r=>({...r,decision:'approve'}))]){
    const t=await harness(input);await t.c.runLearning();
    assert.ok(t.remote['decisions.json']);assert.equal(t.remote['model.json'],undefined);
    assert.match(t.el('modelStatus').textContent,/50 decisions/);
    assert.ok(!JSON.stringify(t.remote).includes('private-ref-'));
  }
});
test('model publishes exactly train output plus date; unchanged data writes neither file',async()=>{
  const t=await harness(rows());await t.c.runLearning();
  const {trained_at,...model}=t.remote['model.json'];assert.ok(trained_at);
  assert.deepEqual(model,train(rows().sort((a,b)=>a.id.localeCompare(b.id))));
  assert.equal(model.active,true);assert.ok(!JSON.stringify(model).includes('private-ref-'));
  t.writes.length=0;await t.c.runLearning();assert.deepEqual(t.writes,[]);
});
test('real RSA/AES sealed backup restores an empty browser and merges a behind browser',async()=>{
  const a=await harness(rows());await a.c.runLearning();
  const b=await harness([],a.remote);await b.c.runLearning();
  assert.equal(Object.keys((await b.rows()).entries).length,100);
  assert.equal(b.writes.length,0);
  const c=await harness([{...rows(1)[0],id:'another-private-ref'}],a.remote);await c.c.runLearning();
  assert.equal(Object.keys((await c.rows()).entries).length,101);
  await b.c.runLearning();assert.equal(Object.keys((await b.rows()).entries).length,101);
});
test('backup conflict retries without dropping existing batches',async()=>{
  const t=await harness(rows(2)), put=t.c.ghPut;let once=true;
  const other=await t.c.inboxReseal([{...rows(1)[0],id:'other-device'}]);
  t.c.ghPut=async(...args)=>{if(once){once=false;t.remote['decisions.json']={batches:[other]};throw Error('conflict');}return put(...args);};
  await t.c.runLearning();assert.equal(t.remote['decisions.json'].batches.length,2);
  assert.equal(Object.keys((await t.rows()).entries).length,3);
});
test('backup/model failures are contained, retryable, and do not change confirmed history',async()=>{
  for(const file of ['decisions.json','model.json']){
    const t=await harness(rows()),put=t.c.ghPut;
    t.c.ghPut=async(...args)=>{if(args[0]===file)throw Error('offline');return put(...args);};
    await assert.doesNotReject(t.c.runLearning());assert.match(t.el('modelStatus').textContent,/unaffected/);
    assert.equal(Object.values((await t.rows()).entries).filter(e=>e.confirmed).length,100);
    t.c.ghPut=put;await t.c.runLearning();assert.ok(t.remote['model.json']);
  }
});
test('unreadable backup fails closed instead of replacing history or publishing a partial model',async()=>{
  const t=await harness(rows(),{'decisions.json':{batches:[{id:'bad',k:'bad',iv:'bad',ct:'bad'}]}});
  await t.c.runLearning();assert.equal(t.writes.length,0);assert.match(t.el('modelStatus').textContent,/failed/);
});
