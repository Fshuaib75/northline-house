import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
for(const path of ['index.html','shop/index.html'])test(path+' expires at fourteen days and treats missing checks as unverified',()=>{
 const h=fs.readFileSync(new URL('../../'+path,import.meta.url),'utf8');const start=h.indexOf('function stockExpired('),end=h.indexOf('\nconst STOCK_CHECKED',start);assert.ok(start>=0);
 const c=vm.createContext({Date});vm.runInContext(h.slice(start,end),c);const now=Date.parse('2026-11-15T00:00:00Z');
 assert.equal(c.stockExpired('2026-11-01T00:00:00Z',now),true);assert.equal(c.stockExpired('2026-11-01T00:00:01Z',now),false);assert.equal(c.stockExpired('',now),true);
});
