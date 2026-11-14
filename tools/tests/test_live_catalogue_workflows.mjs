import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {readPhotoCatalogue} from '../photos/catalogue.mjs';
test('photo checks read split live catalogue, preserve base rows and add new refs',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nl-photo-catalogue-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'shop'));
 const write=(p,v)=>fs.writeFileSync(path.join(root,p),JSON.stringify(v));
 write('shop/catalogue.json',[{ref:'LIVE',img:'live.jpg'}]);write('products.json',[{ref:'LIVE',img:'old.jpg'},{ref:'ADDED',img:'added.jpg'}]);
 assert.deepEqual(readPhotoCatalogue(root),[{ref:'LIVE',img:'live.jpg'},{ref:'ADDED',img:'added.jpg'}]);
 for(const bad of [[],{},[{model:'no ref'}]]){write('shop/catalogue.json',bad);assert.throws(()=>readPhotoCatalogue(root),/catalogue/i);}
 fs.unlinkSync(path.join(root,'shop/catalogue.json'));assert.throws(()=>readPhotoCatalogue(root));
});
test('sourcing sparse checkout and copy both include live external catalogue',()=>{
 const workflow=fs.readFileSync(new URL('../../.github/workflows/sourcing-scan.yml',import.meta.url),'utf8');
 assert.match(workflow,/sparse-checkout:[\s\S]*?shop\/catalogue\.json[\s\S]*?sparse-checkout-cone-mode/);
 assert.match(workflow,/cp site\/shop\/catalogue\.json code\/shop\/catalogue\.json/);
 const photo=fs.readFileSync(new URL('../../.github/workflows/photo-model-test.yml',import.meta.url),'utf8');
 assert.match(photo,/node code\/tools\/photos\/catalogue\.mjs site/);assert.ok(!photo.includes('const built=m?JSON.parse(m[1]):[]'));
});
