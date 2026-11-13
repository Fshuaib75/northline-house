import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
for(const path of ['index.html','shop/index.html'])test(path+' requires live prices and successful revalidation through send/copy handlers',async()=>{
 const h=fs.readFileSync(new URL('../../'+path,import.meta.url),'utf8');
 assert.match(h,/let ITEMS = \[\]/);assert.match(h,/function priceFailure\(/);
 const elements=new Map();let send,copied=0,rechecks=0,valid=false;
 const $=id=>{if(!elements.has(id))elements.set(id,{addEventListener:(_,fn)=>{send=fn;}});return elements.get(id);};
 const c=vm.createContext({$,PRICE_READY:false,cart:[{qty:1}],currentCart:async()=>{rechecks++;return valid;},check:()=>true,copy:()=>{copied++;},orderText:()=> 'order',location:{href:''},WA:'TEST',track:()=>{},encodeURIComponent});
 const lines=h.split(/\r?\n/);vm.runInContext(lines.find(l=>l.startsWith('$("send").addEventListener')),c);vm.runInContext(lines.find(l=>l.startsWith('$("copyOrder").onclick')),c);
 const event={preventDefault(){},currentTarget:{}};
 await send(event);await $('copyOrder').onclick();assert.equal(rechecks,0);assert.equal(copied,0);assert.equal(c.location.href,'');
 c.PRICE_READY=true;await send(event);await $('copyOrder').onclick();assert.equal(rechecks,2);assert.equal(copied,0);assert.equal(c.location.href,'');
 valid=true;await send(event);await $('copyOrder').onclick();assert.equal(copied,1);assert.match(c.location.href,/wa.me\/TEST/);
 assert.doesNotMatch(h,/else ITEMS = ALL.filter\(i=>i.price\)/);
});
