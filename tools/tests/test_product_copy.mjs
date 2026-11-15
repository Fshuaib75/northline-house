import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
for (const file of ['index.html','shop/index.html','tools/product-pages.mjs']) {
 const source=fs.readFileSync(file,'utf8');
 const helper=source.slice(source.indexOf('function productCopy(item){'),source.indexOf('\n}',source.indexOf('function productCopy(item){'))+2);
 const copy=vm.runInNewContext(helper+';productCopy');
 test(file+' preserves decimal measurements, fit instructions and source data',()=>{
  const item={desc:'genuine leather, 6,5 cm heel; order one size up'};
  assert.equal(copy(item),'Genuine leather. 6,5 cm heel. Order one size up');
  assert.equal(item.desc,'genuine leather, 6,5 cm heel; order one size up');
  assert.equal(copy({desc:'EVA, 4.5 cm sole'}),'EVA. 4.5 cm sole');
  assert.equal(copy({desc:'faux leather, cross-strap'}),'Faux leather. Cross-strap');
 });
 test(file+' removes only repeated wording and the separately displayed size reminder',()=>{
  assert.equal(copy({desc:'genuine suede, cross-strap, suede, cross-strap'}),'Genuine suede. Cross-strap');
  assert.equal(copy({desc:'confirm size before payment'}),'');
  assert.equal(copy({}),'');
  assert.equal(copy({desc:"premium men's slide"}),"Men's slide");
 });
}
