import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// Black Friday week: each style drops by its agent commission, only between SALE.start and SALE.end (Lagos date).
const html=fs.readFileSync(new URL('../../shop/index.html',import.meta.url),'utf8');
const start=html.indexOf('const SALE ='),end=html.indexOf('function saleBar(');
const load=day=>{const c=vm.createContext({todayNG:()=>day,N:p=>'₦'+p});vm.runInContext(html.slice(start,end).replace(/^const /gm,'var '),c);return c;};
const shoe={ref:'A',price:48500,comm:4000};
test('no sale before 27 Nov or after 3 Dec',()=>{
  for(const d of ['2026-11-26','2026-12-04']){const c=load(d);assert.equal(c.saleOn(),false);assert.deepEqual(c.onSale(shoe),shoe);assert.equal(c.priceHtml(shoe),'₦48500');}
});
test('during the week the price drops by the commission and the real price is shown crossed out',()=>{
  for(const d of ['2026-11-27','2026-12-03']){const c=load(d),s=c.onSale(shoe);assert.equal(s.price,44500);assert.equal(s.was,48500);assert.match(c.priceHtml(s),/<s class="was">₦48500<\/s>.*₦44500/);}
});
test('styles without a commission keep their price',()=>{
  const c=load('2026-11-28');assert.deepEqual(c.onSale({ref:'B',price:20000,comm:0}),{ref:'B',price:20000,comm:0});
});
test('order message states the saving',()=>{
  assert.match(html,/prices: you save \$\{N\(sv\)\}/);
});
