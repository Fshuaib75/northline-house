import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const helpers=['const sizesOf =','const inStock='].map(prefix=>html.split('\n').find(line=>line.startsWith(prefix))).join('\n');
const formatter=html.slice(html.indexOf('const sizeLine='),html.indexOf('async function stDraw'));
function format(item,stock={}){
  return vm.runInNewContext(`${helpers}\n${formatter}\nsizeLine(item)`,{item,STOCK:stock,SIZES:{M:['40','41','42','43','44']}});
}
test('sharing lists sparse sizes without implying the missing sizes are available',()=>{
  assert.equal(format({ref:'shoe',g:'M',sizes:['40','43','44']}),'Sizes 40, 43, 44');
});
test('sharing excludes stock-disabled sizes just like the product selector',()=>{
  assert.equal(format({ref:'shoe',g:'M',sizes:['40','41','42','43','44']},{shoe:['40','43','44']}),'Sizes 40, 43, 44');
});
test('clothing and age labels retain their exact options',()=>{
  assert.equal(format({ref:'shirt',g:'CL',sizes:['S','M','L']},{shirt:['S','L']}),'Sizes S, L');
  assert.equal(format({ref:'baby',g:'B',sizes:['0–3 months','6–9 months']}),'Ages 0–3 months, 6–9 months');
});
test('one-size and sold-out products do not produce a false size range',()=>{
  const bag={ref:'bag',g:'BG',sizes:['One size']};
  assert.equal(format(bag,{bag:['One size']}),'');
  assert.equal(format(bag,{bag:[]}),'Currently sold out');
  assert.equal(format({ref:'shoe',g:'M',sizes:['40']},{shoe:[]}),'Currently sold out');
});

test('bags and placeholder sizes never show a size line', () => {
  assert.equal(format({ref:'bag',g:'BG',sizes:['00']}),'');
  assert.equal(format({ref:'bag2',g:'BG',sizes:['One size']}),'');
  assert.equal(format({ref:'bag3',g:'BG',sizes:['00']},{bag3:[]}),'Currently sold out');
  assert.equal(format({ref:'belt',g:'AC',sizes:['85','95','105']},{belt:['95']}),'Sizes 95');
});
