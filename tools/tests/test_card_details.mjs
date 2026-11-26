import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../../shop/index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function cardHtml(c){'),html.indexOf('// ---------- numbered pages'));
const render=(item,out=false)=>{
  const ctx=vm.createContext({sizesOf:i=>i.sizes,inStock:(i,s)=>i.stock.includes(s),needsConfirmation:i=>!!i.stale,oneSize:i=>i.sizes[0]==='One size',inDrop:()=>false,isBack:()=>false,isFresh:()=>false,imgTag:()=>'',photoChain:()=>[],esc:s=>String(s),N:p=>String(p),revCard:()=>'',dotsHtml:()=>''});
  vm.runInContext(source,ctx);return ctx.cardHtml({rep:item,out,g:{items:[item,{sizes:['46'],stock:['46']}]}});
};
const shoe={ref:'TEST',brand:'Brand',model:'Palm',colour:'Black',price:25000,sizes:['40','41','42'],stock:['40','42']};
test('card lists only the displayed colour sizes and offers the existing detail action',()=>{
  const card=render(shoe);assert.match(card,/Sizes 40 · 42/);assert.doesNotMatch(card,/Sizes.*41|Sizes.*46/);assert.match(card,/Choose size/);assert.match(card,/data-ref="TEST"/);assert.doesNotMatch(card,/<button/);
});
test('stale, sold-out and one-size cards do not imply confirmed size availability',()=>{
  assert.match(render({...shoe,stale:true}),/card-sizes">Confirm availability/);
  assert.match(render({...shoe,stock:[]},true),/card-sizes">Sold out/);
  assert.match(render({...shoe,sizes:['One size'],stock:['One size']}),/View details/);
});
