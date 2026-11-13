import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
for(const path of ['index.html','shop/index.html'])test(path+' reconciles unavailable sizes and changed prices',()=>{
 const h=fs.readFileSync(new URL('../../'+path,import.meta.url),'utf8'),start=h.indexOf('function reconcileCart('),end=h.indexOf('\nfunction validateCart',start);
 assert.ok(start>=0);const c=vm.createContext({});vm.runInContext(h.slice(start,end),c);
 const r=c.reconcileCart([{ref:'A',size:'42',price:10},{ref:'B',size:'40',price:10}],[{ref:'A',price:10},{ref:'B',price:20}],i=>i.ref==='B');
 assert.equal(r.rows.length,1);assert.equal(r.rows[0].price,20);assert.equal(r.changes.length,2);
});
