import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {features, train} from '../sourcing/ranking.mjs';
const {estimate}=createRequire(import.meta.url)('../extension/guess.js');
const html=fs.readFileSync(new URL('book.template.html',import.meta.url),'utf8');
const sample=JSON.parse(fs.readFileSync(new URL('sample-data.json',import.meta.url),'utf8'));
const config=JSON.parse(fs.readFileSync(new URL('sample-config.json',import.meta.url),'utf8'));
const section=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
function setup(){
  const store=new Map(), elements=new Map(), writes=[], notices=[];
  const el=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',disabled:false});return elements.get(id);};
  const c=vm.createContext({crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,btoa,atob,Blob,URL,console,
    localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
    document:{getElementById:el},setTimeout:()=>{},
    DATA:structuredClone(sample.items).map(r=>({...r,id:r.ref})),S:config,CONFIG:config,BUILD:'test-build',
    LS:{raw:k=>k==='nl-pass'?'test':'',rawSet:()=>{}},tok:{get:()=>true},toast:s=>notices.push(s),
    PARAMS:['rate','perKg','handling','minProfit','profitPct'],pending:{},hidePending:{},over:{},
    published:{hidden:[],updated:'initial',prices:{}},hidden:new Set(),NC:null,addedMeta:[],privateCosts:{},
    INB:{items:[],batches:[{id:'batch'}]},byId:el,
    tl:r=>r.tl||0,kgOf:r=>r.kg||.5,mergeOver:()=>{},mergeHidden:()=>{},save:()=>{},render:()=>{},stats:()=>{},
    priceMap:()=>({}),errMsg:e=>e.message,fetch:async()=>({json:async()=>({build:'test-build'})}),
    b64:s=>btoa(s),ghJson:async()=>({data:null}),ghPut:async(path)=>{writes.push(path);},
    saveJson:async(path,fn,fallback)=>{writes.push(path);return fn(fallback);},
    mergeAdded:()=>{},inboxReseal:async items=>({id:'resealed',items}),inboxLoad:()=>{}
  });
  vm.runInContext(section('const u8=','// ---------- added products ----------'),c);
  vm.runInContext(section('async function publishPrices(', '// ---------- review inbox ----------'),c);
  vm.runInContext(section('async function inboxApply(', '// unpin the top bar'),c);
  return {c,store,writes,notices,el,run:s=>vm.runInContext(s,c),rows:async()=>JSON.parse(JSON.stringify(await vm.runInContext('decisionRead("test")',c)))};
}
test('book feature vectors match sourcing VERSION 1 across categories, parameters and price bands',()=>{
  const {c}=setup();
  for(const cat of ['shoes','bags','clothing','baby'])for(const cost of [50,950,3100,20000])for(const fam of ['Black','Pink & purple']){
    const item={cat,fam,sizes:['40','41','42']};
    for(const params of [{},config,{rate:45,perKg:8500,handling:800,minProfit:6500,profitPct:24}]){
      assert.deepEqual(Array.from(c.decisionFeatures(item,cost,.65,params)),features(item,estimate(cost,.65,params)));
    }
  }
});
test('encrypted journal, deduplication, password failures, pending exclusion and private group recovery',async()=>{
  const t=setup(), row=t.c.decisionRow({...sample.inbox[0],source:'extension'},'approve','one');
  const commit=await t.c.decisionPrepare([row]);
  assert.equal((await t.rows()).entries.one.confirmed,false);
  const raw=t.store.get('nl-decisions-v1');
  assert.ok(!raw.includes('features')&&!raw.includes(row.ref));
  await assert.rejects(t.c.decisionRead('wrong'),/pass/);
  await commit(); await (await t.c.decisionPrepare([row]))();
  assert.equal(Object.keys((await t.rows()).entries).length,1);
  const late={...row,id:'late',product_key:row.ref,decision:'reject'};
  await (await t.c.decisionPrepare([late]))();
  assert.equal((await t.rows()).entries.late.row.product_key,row.product_key);
  assert.equal(train([(await t.rows()).entries.one.row]).active,false);
});
test('approve all inbox types, stable retry IDs, late gone reject and no public decision payload',async()=>{
  const t=setup();t.c.INB.items=sample.inbox.map(x=>({...x,on:true,batch:'batch',source:'weekly robot'}));
  await t.c.inboxApply('approve');
  let entries=Object.values((await t.rows()).entries);
  assert.equal(entries.filter(e=>e.confirmed).length,5,t.notices.join('; '));
  assert.equal(entries.filter(e=>e.row.reason==='late_hide'&&e.row.decision==='reject').length,1);
  const changed=entries.find(e=>e.row.ref==='TEST-M02-BRN').row;
  assert.deepEqual(changed.features,Array.from(t.c.decisionFeatures({...sample.items[2],cat:'shoes'},1600,.5,config)));
  await t.c.inboxApply('approve');
  assert.equal(Object.values((await t.rows()).entries).filter(e=>e.confirmed).length,5);
  assert.ok(t.writes.every(p=>['prices.json','private.json','products.json','inbox.json'].includes(p)));
});
test('dismiss commits only after cleanup; failed approve and storage failure do not become training rows',async()=>{
  const t=setup();t.c.INB.items=[{...sample.inbox[0],on:true,batch:'batch'}];
  t.c.saveJson=async()=>{throw Error('offline');};
  await t.c.inboxApply('dismiss');
  assert.equal(Object.values((await t.rows()).entries)[0].confirmed,false);
  await t.c.inboxApply('approve');
  assert.ok(Object.values((await t.rows()).entries).every(e=>!e.confirmed));
  t.c.localStorage.setItem=()=>{throw Error('quota');};t.writes.length=0;
  await t.c.inboxApply('approve');assert.equal(t.writes.length,0);
  assert.ok(t.notices.some(s=>s.includes('quota')));
});
test('approve survives inbox cleanup failure; dismiss retries deduplicate and preserve provenance',async()=>{
  const t=setup();t.c.INB.items=[{...sample.inbox[0],on:true,source:'sourcing scan',decision_origin:'original',batch:'resealed'}];
  t.c.saveJson=async(path,fn,fallback)=>{if(path==='inbox.json')throw Error('cleanup');return fn(fallback);};
  await t.c.inboxApply('approve');
  const row=Object.values((await t.rows()).entries)[0];assert.equal(row.confirmed,true);assert.equal(row.row.source,'sourcing scan');
  const d=setup();d.c.INB.items=[{...sample.inbox[0],on:true,batch:'batch',source:'extension'}];
  await d.c.inboxApply('dismiss');await d.c.inboxApply('dismiss');
  const entries=Object.values((await d.rows()).entries);assert.equal(entries.length,1);assert.equal(entries[0].row.decision,'reject');assert.equal(entries[0].confirmed,true);
});
test('only published new hides are late rejects; cancelled, existing hides and failures are excluded',async()=>{
  const t=setup();t.c.hidePending={'TEST-M01-BLK':true,'TEST-M01-TAN':false};
  await t.c.publishPrices();
  const entries=Object.values((await t.rows()).entries);assert.equal(entries.length,1);assert.equal(entries[0].confirmed,true);assert.equal(entries[0].row.reason,'late_hide');
  t.c.hidePending={'TEST-M01-BLK':true};await t.c.publishPrices();assert.equal(Object.keys((await t.rows()).entries).length,1);
  const failed=setup();failed.c.hidePending={'TEST-M01-BLK':true};failed.c.saveJson=async()=>{throw Error('offline');};
  await failed.c.publishPrices();assert.equal(Object.values((await failed.rows()).entries)[0].confirmed,false);
});
test('confirmation storage failure keeps recoverable snapshots and explains partial success',async()=>{
  const t=setup(), row=t.c.decisionRow(sample.inbox[0],'approve','one');
  const commit=await t.c.decisionPrepare([row]);t.c.localStorage.setItem=()=>{throw Error('quota');};
  await t.c.decisionFinish(commit);
  assert.equal((await t.rows()).entries.one.confirmed,false);
  assert.match(t.el('decisionNote').textContent,/action saved/);
});
test('export separates trainable decisions from interrupted snapshots and works with an empty inbox',async()=>{
  const t=setup();let downloaded;
  t.c.URL={createObjectURL:b=>{downloaded=b;return 'blob:test';},revokeObjectURL:()=>{}};
  t.c.document.createElement=()=>({click(){}});
  await (await t.c.decisionPrepare([t.c.decisionRow(sample.inbox[0],'approve','ok')]))();
  await t.c.decisionPrepare([t.c.decisionRow(sample.inbox[1],'reject','interrupted')]);
  await t.el('decisionExport').onclick();
  const out=JSON.parse(await downloaded.text());
  assert.deepEqual(out.decisions.map(r=>r.id),['ok']);
  assert.deepEqual(out.unconfirmed.map(r=>r.id),['interrupted']);
  assert.equal(train(out.decisions).examples,1);
  assert.match(t.el('decisionNote').textContent,/Never share or commit/);
});
test('inbox publishing captures unrelated pending hides without counting its gone item twice',async()=>{
  const t=setup();t.c.hidePending={'TEST-M01-BLK':true};
  t.c.INB.items=[{...sample.inbox.at(-1),on:true,batch:'batch',source:'weekly robot'}];
  await t.c.inboxApply('approve');
  const rows=Object.values((await t.rows()).entries);
  assert.equal(rows.length,2);assert.ok(rows.every(e=>e.confirmed&&e.row.decision==='reject'));
});
test('built template is valid JavaScript and keeps the test GitHub write endpoint disabled',()=>{
  const built=fs.readFileSync(new URL('../../_dev/book/index.html',import.meta.url),'utf8');
  for(const match of built.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
  assert.ok(built.includes('http://127.0.0.1:9/dev-build-no-github/'));
  assert.ok(!built.includes('https://api.github.com/repos/Fshuaib75/northline-house/contents/'));
  for(const key of ['__DATA__','__CONFIG__','__BUILD__','__STN__'])assert.equal(html.split(key).length-1,1);
});
