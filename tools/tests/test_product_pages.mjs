import test from 'node:test';import assert from 'node:assert/strict';
import {prepare,render} from '../product-pages.mjs';
const now=new Date('2026-11-13T12:00:00Z'),item={ref:'TEST',brand:'Brand',model:'Slide',colour:'Black',img:'https://supplier.example/whole.jpg'};
test('only authoritative visible prices enter generated pages',()=>{
 assert.throws(()=>prepare([item],null,{},[],now));
 assert.equal(prepare([item],{prices:{}},{},[],now).length,0);
 assert.equal(prepare([item],{prices:{TEST:[30000,4000]},hidden:['TEST']},{},[],now).length,0);
 assert.equal(prepare([item],{prices:{TEST:[30000,4000]}},{},['whole.jpg'],now).length,0);
 assert.equal(prepare([{...item,ref:'../escape'}],{prices:{'../escape':[30000,4000]}},{},[],now).length,0);
});
test('scheduled prices and stock age control visible price and structured offers',()=>{
 const prices={prices:{TEST:[30000,4000]},switchAt:'2026-11-13',next:{TEST:[35000,4000]}};
 const fresh={TEST:{on:1,stock:['42'],checked_at:'2026-11-12T12:00:00Z'}};
 const [i]=prepare([item],prices,fresh,[],now);assert.equal(i.price,35000);assert.equal(i.availability,'InStock');
 assert.equal(prepare([item],prices,{},[],new Date('2026-11-12T23:30:00Z'))[0].price,35000);
 const html=render(i,'2026-11-13');assert(html.includes('"price":35000'));assert(html.includes('rel="canonical"'));assert(html.includes('/shop/?i=TEST'));
 for(const stock of [{},{TEST:{...fresh.TEST,stale:true}},{TEST:{...fresh.TEST,checked_at:'2026-10-30T12:00:00Z'}}]){
 const [stale]=prepare([item],prices,stock,[],now);assert.equal(stale.availability,null);assert(!render(stale,'2026-11-13').includes('"offers"'));
 }
});
test('product text cannot terminate structured data or insert markup',()=>{
 const [i]=prepare([{...item,model:'</script><img src=x onerror=alert(1)>'}],{prices:{TEST:[30000,4000]}},{},[],now);
 const html=render(i,'2026-11-13');assert(!html.includes('<img src=x'));assert(html.includes('\\u003c/script>'));assert(!html.includes('aggregateRating'));
});
