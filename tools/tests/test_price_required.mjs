import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
for(const path of ['index.html','shop/index.html'])test(path+' requires live prices for send/copy and has retry',()=>{
 const h=fs.readFileSync(new URL('../../'+path,import.meta.url),'utf8');
 assert.match(h,/let ITEMS = \[\]/);assert.match(h,/function priceFailure\(/);
 assert.match(h,/if\(!PRICE_READY\|\|!cart.length\|\|!check\(\)\)/);
 assert.match(h,/if\(!PRICE_READY\|\|!cart.length\) return/);
 assert.doesNotMatch(h,/else ITEMS = ALL.filter\(i=>i.price\)/);
});
