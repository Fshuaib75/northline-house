import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import os from 'node:os';import path from 'node:path';import {existingCatalogue} from '../sourcing/engine.mjs';
const root=new URL('../../',import.meta.url),html=fs.readFileSync(new URL('shop/index.html',root),'utf8');
test('shop document no longer carries the full catalogue and loads it before pricing',()=>{
 assert.ok(Buffer.byteLength(html)<200000,'shop HTML must remain under 200 KB');
 const catalogue=JSON.parse(fs.readFileSync(new URL('shop/catalogue.json',root),'utf8'));
 assert.ok(catalogue.length>100);assert.equal(new Set(catalogue.map(i=>i.ref)).size,catalogue.length);
 assert.ok(html.includes('catalogueReady'));assert.ok(html.includes('Array.isArray(base)'));
});
test('sourcing preserves deduplication across old and external catalogue formats',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nl-catalogue-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.mkdirSync(path.join(dir,'shop'));
 const rows=[{ref:'BASE'}],added=[{ref:'ADDED'}];fs.writeFileSync(path.join(dir,'products.json'),JSON.stringify(added));fs.writeFileSync(path.join(dir,'shop/index.html'),'let ALL = '+JSON.stringify(rows)+';\n');assert.deepEqual(existingCatalogue(dir),[...rows,...added]);
 fs.writeFileSync(path.join(dir,'shop/index.html'),'let ALL=[];\n');fs.writeFileSync(path.join(dir,'shop/catalogue.json'),JSON.stringify(rows));assert.deepEqual(existingCatalogue(dir),[...rows,...added]);fs.unlinkSync(path.join(dir,'shop/catalogue.json'));assert.throws(()=>existingCatalogue(dir));
});
