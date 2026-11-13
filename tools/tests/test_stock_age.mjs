import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
for(const path of ['index.html','shop/index.html'])test(path+' expires at fourteen days and treats missing checks as unverified',()=>{
 const h=fs.readFileSync(new URL('../../'+path,import.meta.url),'utf8');const start=h.indexOf('function stockExpired('),end=h.indexOf('\nconst STOCK_CHECKED',start);assert.ok(start>=0);
 const c=vm.createContext({Date});vm.runInContext(h.slice(start,end),c);const now=Date.parse('2026-11-15T00:00:00Z');
 assert.equal(c.stockExpired('2026-11-01T00:00:00Z',now),true);assert.equal(c.stockExpired('2026-11-01T00:00:01Z',now),false);assert.equal(c.stockExpired('',now),true);
});
for(const path of ['index.html','shop/index.html'])test(path+' keeps absent records eligible and respects explicit stale supplier records',()=>{
 const h=fs.readFileSync(new URL('../../'+path,import.meta.url),'utf8');
 const start=h.indexOf('function stockExpired('),end=h.indexOf('\n',h.indexOf('const needsConfirmation=',start));
 const c=vm.createContext({Date,ALL:[],STOCK:{},BACK:{}});vm.runInContext(h.slice(start,end),c);
 assert.equal(vm.runInContext('needsConfirmation({ref:"MISSING"})',c),false);
 const loader=h.slice(h.indexOf('function capPhotos('),h.indexOf('Promise.all([',h.indexOf('function capPhotos(')));
 vm.runInContext(loader,c);
 for(const load of [c.capPhotos,c.brandStock]){
  load({checked:new Date().toISOString(),styles:{FRESH:{on:1},OLD:{on:1,checked_at:'2020-01-01'},STALE:{on:1,stale:true,checked_at:new Date().toISOString()}}});
  assert.equal(vm.runInContext('needsConfirmation({ref:"FRESH"})',c),false);
  assert.equal(vm.runInContext('needsConfirmation({ref:"OLD"})',c),true);
  assert.equal(vm.runInContext('needsConfirmation({ref:"STALE"})',c),true);
 }
 vm.runInContext(fs.readFileSync(new URL('../../shop/hero-pool.js',import.meta.url),'utf8'),c);
 const result=vm.runInContext(`NLHero.eligible({refs:['MISSING','FRESH','OLD','STALE']},['MISSING','FRESH','OLD','STALE'].map(ref=>({ref,model:ref,price:30000})),{stale:needsConfirmation,soldOut:()=>false,calm:()=>true,loud:()=>false,photo:()=>'/full.jpg',category:()=>'M'})`,c);
 assert.deepEqual(Array.from(result.accepted,i=>i.ref),['MISSING','FRESH']);
 assert.deepEqual(Array.from(result.rejected,i=>i.reason),['confirm availability','confirm availability']);
});
