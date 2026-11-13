import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const h=fs.readFileSync(new URL('../book/book.template.html',import.meta.url),'utf8');
const c=vm.createContext({});const start=h.indexOf('function mergeSessionPrices('),end=h.indexOf('\nfunction priceMap',start);
if(start>=0)vm.runInContext(h.slice(start,end),c);
test('preserves unknown refs and detects concurrent known price edits',()=>{
 assert.equal(typeof c.mergeSessionPrices,'function');
 const base={prices:{A:[10,1]},params:{rate:1}},live={...base,prices:{A:[10,1],B:[20,2]}};
 assert.deepEqual(JSON.parse(JSON.stringify(c.mergeSessionPrices(base,live,{A:[11,1]},['A'],'prices'))),{A:[11,1],B:[20,2]});
 assert.throws(()=>c.mergeSessionPrices(base,{...live,prices:{A:[12,1],B:[20,2]}},{A:[11,1]},['A'],'prices'),/reload/);
});
