import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {setup} from '../book/decisions.test.mjs';
import {baseline,predict} from '../sourcing/ranking.mjs';
const html=fs.readFileSync(new URL('../book/book.template.html',import.meta.url),'utf8');
const sample=JSON.parse(fs.readFileSync(new URL('../book/sample-data.json',import.meta.url),'utf8'));
const excerpt=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
function harness(){
  const t=setup();t.c.esc=s=>String(s??'').replaceAll('<','&lt;').replaceAll('>','&gt;');
  t.c.fmtN=n=>'₦'+Math.round(n).toLocaleString('en-NG');t.c.catOf=r=>r.cat||'shoes';
  t.c.liveOf=r=>t.c.published.prices[r.ref]||null;
  t.run(excerpt('function iWho(', 'function inboxCount('));
  t.run(excerpt('const iRec=', 'function inboxFilter('));
  t.cache=items=>{t.c.INB.items=items;t.c.cacheMatches();};
  return t;
}
const item=(ref,extra={})=>({t:'new',ref,brand:'Test',cat:'shoes',g:'M',model:'Slide',tl:900,sizes:['40','41','42','43','44','45'],fam:'Black',colour:'Black',...extra});
test('plain styles use canonical baseline and valid active model predictions',()=>{
  const t=harness(),x=item('one'),vector=Array.from(t.c.decisionRow(x,'approve','test').features);
  assert.equal(t.c.itemMatch(x).score,baseline(vector));assert.equal(t.c.itemMatch(x).label,'Strong match');
  const model={version:1,active:true,weights:[-5,0,0,0,0,0,0,0,0]};
  t.c.model=model;t.run('MATCH_MODEL=model');assert.equal(t.c.itemMatch(x).score,predict(model,vector));
  for(const bad of [null,{...model,active:false},{...model,version:2},{...model,weights:[NaN]}]){
    t.c.model=bad;t.run('MATCH_MODEL=model');assert.equal(t.c.itemMatch(x).method,'Baseline');
  }
});
test('sample Glitz platform and loud details stay Unlikely even with a strongly approving model',()=>{
  const t=harness();t.c.model={version:1,active:true,weights:[100,0,0,0,0,0,0,0,0]};t.run('MATCH_MODEL=model');
  const glitz=sample.inbox.find(x=>x.model==='Glitz platform');assert.ok(glitz);
  for(const x of [glitz,item('rhinestone',{desc:'Rhinestone strap'}),item('print',{model:'Printed slide'}),item('pink',{fam:'Pink & purple',colour:'Pink'})]){
    const m=t.c.itemMatch(x);assert.equal(m.label,'Unlikely');assert.equal(m.score,0);assert.match(m.why,/Style rule/);
  }
  const source=fs.readFileSync(new URL('../sourcing/minimal.mjs',import.meta.url),'utf8');
  assert.ok(html.includes(source.replace('export function minimalCheck','function minimalCheck')));
});
test('unknown cost stays labelled without inventing a preferred price band',()=>{
  const t=harness(),x=item('unknown',{tl:null});t.cache([x]);
  assert.match(t.c.itemMatch(x).why,/Cost unavailable/);assert.ok(!t.c.matchTag(x).includes('price band'));
});
test('Men then Women then Kids, score within audience, colours together, no score filtering',()=>{
  const t=harness(),items=[item('w',{g:'W',grp:'women'}),item('m-low',{grp:'men-low',tl:100000}),item('kid',{g:'B',cat:'baby',grp:'kids'}),item('m-high',{grp:'men-high'}),item('m-brown',{grp:'men-high',colour:'Brown',on:true}),{t:'price',ref:'unknown-price',now:400},{t:'gone',ref:'unknown-gone'}];
  t.cache(items);const groups=t.c.iGroups('new');
  assert.deepEqual(Array.from(groups,g=>g.k),['men|men-high','men|men-low','women|women','baby|kids']);
  assert.deepEqual(Array.from(groups[0].ns).sort(),[3,4]);
  const indices=['new','price','gone'].flatMap(k=>Array.from(t.c.iGroups(k)).flatMap(g=>Array.from(g.ns)));
  assert.deepEqual(indices.sort(),[0,1,2,3,4,5,6]);assert.equal(items[4].on,true);
});
test('matches compute once before grouping, never in sort comparisons or chips',()=>{
  const t=harness(),original=t.c.itemMatch;let calls=0;t.c.itemMatch=x=>{calls++;return original(x);};
  const items=Array.from({length:40},(_,i)=>item('ref-'+i,{grp:'group-'+(i%10)}));
  t.cache(items);assert.equal(calls,40);
  for(let i=0;i<3;i++){t.c.iGroups('new');items.forEach(x=>t.c.matchTag(x));}
  assert.equal(calls,40);assert.ok(!('score' in items[0]));
});
test('price checks compare current live price against new landed cost and recorded commission',()=>{
  const t=harness();t.c.DATA=[{ref:'price',cat:'shoes',kg:.5}];
  t.c.S={rate:30,perKg:12000,handling:1500};t.c.published={prices:{price:[20000,2000]}};
  const x={t:'price',ref:'price',now:100};
  assert.equal(t.c.priceProfitCheck(x).net,7500);assert.match(t.c.priceProfitTag(x),/Still ₦7,500 profit per pair/);
  assert.equal(t.c.priceProfitCheck({...x,now:600}).net,-7500);
  assert.match(t.c.priceProfitTag({...x,now:600}),/<b[^>]*>Loses ₦7,500 per pair: hide or reprice/);
  t.c.published.params={rate:40,perKg:10000,handling:1000};assert.equal(t.c.priceProfitCheck(x).net,8000);
  for(const bad of [{...x,now:null},{...x,ref:'absent'}])assert.match(t.c.priceProfitTag(bad),/Profit unavailable/);
  t.c.published.prices.price=[20000,null];assert.equal(t.c.priceProfitCheck(x),null);
});
test('restore known-new and unknown-change filters without filtering by score',async()=>{
  const t=harness(),known=t.c.DATA[0].ref;
  const rows=[item(known),item('new',{model:'Glitz platform'}),{t:'price',ref:known},{t:'gone',ref:known},{t:'price',ref:'removed'},{t:'gone',ref:'removed'}];
  t.c.RSA={name:'RSA-OAEP',hash:'SHA-256'};t.c.crypto={subtle:{importKey:async()=>({})}};t.c.unseal=async()=>({jwk:{}});
  t.c.fetch=async()=>({ok:true,json:async()=>({jwk:{}})});
  t.c.ghJson=async f=>({data:f==='inbox.json'?{batches:[{id:'batch'}]}:null});
  t.c.openBatch=async()=>({items:rows});t.c.loadAdded=async()=>{};t.c.inboxDraw=()=>{};
  t.run(excerpt('async function inboxLoad(){','const IF='));await t.c.inboxLoad();
  assert.deepEqual(Array.from(t.c.INB.items,x=>x.t+':'+x.ref),['new:new','price:'+known,'gone:'+known]);
});
test('short new chips only; price gets profit check, gone no tag, explanation once',()=>{
  const t=harness();Object.assign(t.c,{IF:{who:'all',brand:''},lastOf:a=>a.at(-1),KIND:{slide:'slide'},NEW_ON:false,quote:()=>({sell:100}),quoteNew:()=>null,fmtT:String});
  t.c.document.querySelectorAll=()=>[];
  for(const id of ['inboxBody','ifWho'])t.el(id).querySelectorAll=()=>[];
  t.run(excerpt('function inboxCount(){','// ---- grouping:'));t.run(excerpt('function inboxFilter(){','// Re-lock the items'));
  const items=[item('one'),sample.inbox.find(x=>x.model==='Glitz platform'),{t:'price',ref:'unknown-price',old:20,now:30},{t:'gone',ref:'unknown-gone'}];
  t.c.INB.items=items;t.c.inboxDraw({});const output=t.el('inboxBody').innerHTML;
  assert.equal((output.match(/class="match"/g)||[]).length,2);assert.equal((output.match(/class="profit-check"/g)||[]).length,1);
  assert.equal((output.match(/class="ichip"/g)||[]).length,4);assert.match(output,/Strong match · Calm colour, your price band/);
  assert.match(output,/Unlikely · Style rule/);assert.ok(!/Baseline ·|Advisory only|Learned preference/.test(output));
  assert.equal(output.split('Tags follow your rules until 50 decisions, then your own model. They never hide anything.').length-1,1);
  assert.equal(t.c.matchTag(items[2]),'');assert.equal(t.c.matchTag(items[3]),'');
  const code=excerpt('function itemMatch(','// product code');assert.ok(!/fetch\(|ghPut|LS\.set|localStorage/.test(code));
});
