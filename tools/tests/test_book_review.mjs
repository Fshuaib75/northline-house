import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {setup} from '../book/decisions.test.mjs';
import {baseline,predict} from '../sourcing/ranking.mjs';
const html=fs.readFileSync(new URL('../book/book.template.html',import.meta.url),'utf8');
const excerpt=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
function harness(){
  const t=setup();t.c.esc=s=>String(s??'').replaceAll('<','&lt;').replaceAll('>','&gt;');
  t.run(excerpt('function iWho(', 'function inboxCount('));
  t.run(excerpt('const iRec=', 'function inboxFilter('));
  return t;
}
const item=(ref,extra={})=>({t:'new',ref,brand:'Test',cat:'shoes',g:'M',model:'Slide',tl:900,sizes:['40','41','42','43','44','45'],fam:'Black',colour:'Black',...extra});
test('every row gets a baseline tag and factual hints, with no preference filtering',()=>{
  const t=harness(),x=item('one');
  const vector=Array.from(t.c.decisionRow(x,'approve','test').features),m=t.c.itemMatch(x);
  assert.equal(m.score,baseline(vector));assert.equal(m.label,'Strong match');assert.match(m.why,/Calm colour/);
  const expensive=item('costly',{tl:100000,fam:'Pink',sizes:[]});
  assert.equal(t.c.itemMatch(expensive).label,'Unlikely');
  assert.match(t.c.matchTag(expensive),/Unlikely/);
  assert.match(t.c.matchTag(x),/Advisory only/);
});
test('only valid active VERSION 1 models are used, matching canonical prediction',()=>{
  const t=harness(),x=item('one');
  const model={version:1,active:true,weights:[-5,0,0,0,0,0,0,0,0]};
  t.c.model=model;t.run('MATCH_MODEL=model');
  assert.equal(t.c.itemMatch(x).score,predict(model,Array.from(t.c.decisionRow(x,'approve','t').features)));
  assert.equal(t.c.itemMatch(x).label,'Unlikely');assert.match(t.c.matchTag(x),/Learned preference/);
  for(const bad of [null,{...model,active:false},{...model,version:2},{...model,weights:[NaN]}]){
    t.c.model=bad;t.run('MATCH_MODEL=model');assert.equal(t.c.itemMatch(x).method,'Baseline');
  }
});
test('missing private cost still gets a tag without invented price-band claims',()=>{
  const t=harness();for(const x of [item('new',{tl:null}),{t:'gone',ref:'unknown'}, {t:'price',ref:'unknown',now:null}]){
    const m=t.c.itemMatch(x);assert.ok(Number.isFinite(m.score));assert.match(m.why,/unavailable/);
    assert.ok(!m.why.includes('Within the baseline price band'));assert.match(t.c.matchTag(x),/Baseline/);
  }
});
test('sections sort strongest groups first, colours stay together and all indices/selection remain',()=>{
  const t=harness();
  const items=[item('a',{grp:'style-a',tl:100000,fam:'Pink',sizes:[]}),item('b',{grp:'style-b'}),item('c',{grp:'style-a',colour:'Brown',on:true}),item('d',{grp:'style-d',tl:10000}),{t:'price',ref:'unknown-price',now:400},{t:'gone',ref:'unknown-gone'}];
  t.c.INB.items=items;
  const groups=t.c.iGroups('new');assert.equal(groups[0].k,'style-a');
  assert.deepEqual(Array.from(groups[0].ns).sort(),[0,2]);
  const indices=['new','price','gone'].flatMap(k=>Array.from(t.c.iGroups(k)).flatMap(g=>Array.from(g.ns)));
  assert.deepEqual(indices.sort(),[0,1,2,3,4,5]);assert.equal(items[2].on,true);
  assert.ok(!excerpt('async function inboxLoad(){','const IF=').includes('INB.items.filter'));
});
test('match metadata never persists in decision rows; displayed hints escape unsafe supplier notes',()=>{
  const t=harness(),x=item('one',{review_notes:'<script>oops</script>'});
  t.c.matchTag(x);assert.ok(!('score' in x));assert.match(t.c.matchTag(x),/&lt;script&gt;/);
  const code=excerpt('function itemMatch(','// product code');assert.ok(!/fetch\(|ghPut|LS\.set|localStorage/.test(code));
  assert.equal(html.split('${matchTag(x)}').length-1,1);
});
test('rendered To review contains one tag per new, price and gone row, including unavailable-cost rows',()=>{
  const t=harness();Object.assign(t.c,{IF:{who:'all',brand:''},lastOf:a=>a.at(-1),KIND:{slide:'slide'},NEW_ON:false,quote:()=>({sell:100}),quoteNew:()=>null,fmtN:String,fmtT:String,catOf:r=>r.cat||'shoes',liveOf:()=>null});
  t.c.document.querySelectorAll=()=>[];
  for(const id of ['inboxBody','ifWho'])t.el(id).querySelectorAll=()=>[];
  t.run(excerpt('function inboxCount(){','// ---- grouping:'));
  t.run(excerpt('function inboxFilter(){','// Re-lock the items'));
  t.c.INB.items=[item('one'),item('two',{tl:100000}),{t:'price',ref:'unknown-price',old:20,now:30},{t:'gone',ref:'unknown-gone'}];
  t.c.inboxDraw({});
  const output=t.el('inboxBody').innerHTML;
  assert.equal((output.match(/class="match"/g)||[]).length,4);
  assert.equal((output.match(/class="ichip"/g)||[]).length,4);
  assert.match(output,/Cost or weight unavailable/);assert.match(output,/Strong match/);assert.match(output,/Unlikely/);
});
