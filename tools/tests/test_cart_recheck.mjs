import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
for(const path of ['index.html','shop/index.html'])test(path+' reconciles unavailable sizes and changed prices',()=>{
 const h=fs.readFileSync(new URL('../../'+path,import.meta.url),'utf8'),start=h.indexOf('function reconcileCart('),end=h.indexOf('\nfunction validateCart',start);
 assert.ok(start>=0);const c=vm.createContext({});vm.runInContext(h.slice(start,end),c);
 const r=c.reconcileCart([{ref:'A',size:'42',price:10},{ref:'B',size:'40',price:10}],[{ref:'A',price:10},{ref:'B',price:20}],i=>i.ref==='B');
 assert.equal(r.rows.length,1);assert.equal(r.rows[0].price,20);assert.equal(r.changes.length,2);
});
for(const path of ['index.html','shop/index.html'])test(path+' blocks revalidation before initial prices load and retains rows on a failed recheck',async()=>{
 const h=fs.readFileSync(new URL('../../'+path,import.meta.url),'utf8'),start=h.indexOf('async function currentCart('),end=h.indexOf('\nfunction orderText(',start);
 let calls=0,validated=0;const cart=[{ref:'A',size:'42',price:10}];
 const c=vm.createContext({PRICE_READY:false,cart,alert:()=>{},fresh:async()=>{calls++;return null;},validateCart:()=>{validated++;return true;}});
 vm.runInContext(h.slice(start,end),c);assert.equal(await c.currentCart(),false);assert.equal(calls,0);
 c.PRICE_READY=true;assert.equal(await c.currentCart(),false);assert.equal(validated,0);assert.equal(c.cart,cart);
});
for(const path of ['index.html','shop/index.html'])test(path+' rechecks hidden refs, activated prices and replaces old stock before sending',async()=>{
 const h=fs.readFileSync(new URL('../../'+path,import.meta.url),'utf8'),start=h.indexOf('async function currentCart('),end=h.indexOf('\nfunction orderText(',start);
 const stock={A:['42'],REMOVED:['40']};let checked;
 const c=vm.createContext({PRICE_READY:true,STOCK:stock,BACK:{},ITEMS:[{ref:'A',price:10},{ref:'HIDDEN',price:20}],alert:()=>{},
  fresh:async p=>p==='prices.json'?{prices:{A:[10,1],HIDDEN:[20,2]},next:{A:[30,3]},switchAt:'2026-11-14',hidden:['HIDDEN']}:{styles:{}},
  todayNG:()=> '2026-11-14',brandStock:()=>{stock.A=['41'];},capPhotos:()=>{},validateCart:()=>{checked=c.ITEMS;return true;}});
 vm.runInContext(h.slice(start,end),c);assert.equal(await c.currentCart(),true);assert.equal(checked.length,1);assert.equal(checked[0].price,30);assert.deepEqual(stock.A,['41']);assert.equal(stock.REMOVED,undefined);
});
