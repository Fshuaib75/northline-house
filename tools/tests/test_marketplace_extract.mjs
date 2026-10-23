import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),G=require('../extension/guess.js');
const code=fs.readFileSync(new URL('../extension/extract.js',import.meta.url),'utf8');
async function extract(offers){
 const product={'@type':'Product',name:'Test shoe',brand:{name:'Marjin'},sku:'TEST',image:['https://cdn.example/shoe.jpg'],offers,
  hasVariant:[{'@type':'Product',size:'38',offers:{availability:'https://schema.org/InStock'}}]};
 const doc={title:'Test',images:[],querySelector:()=>null,querySelectorAll:selector=>selector==='script[type="application/ld+json"]'?[{textContent:JSON.stringify(product)}]:[]};
 return vm.runInNewContext(code,{document:doc,location:{hostname:'www.trendyol.com',href:'https://www.trendyol.com/marjin/test-p-123?merchantId=42',pathname:'/marjin/test-p-123',search:'?merchantId=42'},URL,URLSearchParams});
}
test('single identifiable marketplace offer preserves observed seller, price and URL',async()=>{
 const r=await extract({'@type':'Offer',price:500,priceCurrency:'TRY',seller:{name:'Seller A'}});
 assert.equal(r.marketplace,'Trendyol');assert.equal(r.seller,'Seller A');assert.equal(r.price,500);assert.ok(r.url.includes('merchantId=42'));
});
test('multiple or unknown sellers and aggregate prices require manual price and sizes',async()=>{
 for(const offers of [[{price:500,seller:{name:'A'}},{price:400,seller:{name:'B'}}],{price:500},{'@type':'AggregateOffer',lowPrice:400,seller:{name:'A'}}]){
  const r=await extract(offers);assert.equal(r.price,null);assert.equal(r.sizes.length,0);assert.match(r.marketplace_note,/manually/);
 }
});
test('stock-evidence mode leaves unread sizes empty',()=>{
 for(const line of ['W','M','CL','BG'])assert.deepEqual(G.cleanSizes([],line,'',false),[]);
 assert.deepEqual(G.cleanSizes(['38','Standart'],'W','',false),['38','One size']);
});
