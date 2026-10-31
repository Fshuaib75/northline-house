import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {builtBook} from '../book/test-build.mjs';
import {normalize} from '../sourcing/engine.mjs';
const read=p=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const shop=read('shop/index.html'),agent=read('index.html'),book=read('tools/book/book.template.html');
const section=(s,start,end)=>s.slice(s.indexOf(start),s.indexOf(end,s.indexOf(start)));
test('delivery wording exists at price, bag and Ordering; origin line stays factual',()=>{
  const wording='Prices include shipping from Türkiye to Nigeria. Delivery from our pickup point in Abuja to your address is paid by you on delivery.';
  assert.equal(shop.split(wording).length-1,3);
  assert.equal(agent.split(wording).length-1,3);
  assert.match(shop,/id="pdPrice"[^]*?Prices include shipping/);
  assert.match(shop,/id="total"[^]*?Prices include shipping/);
});
function message(html,code='AMINA'){
  const c={cart:[{model:'Leather slide',ref:'DRM-1',colour:'Black',size:'42',qty:2,price:40000,comm:4000}],REF:{code},N:n=>'₦'+n.toLocaleString('en-NG'),$:id=>({value:id==='agentCode'?code:id==='cName'?'Test Customer':''}),store:{get:()=>code}};
  vm.createContext(c);vm.runInContext(section(html,'function orderText(){','\n}').concat('\n}'),c);return c.orderText();
}
test('customer message keeps attribution and totals, removes commission suffix; agent message retains earnings',()=>{
  const msg=message(shop);assert.match(msg,/Agent: AMINA/);assert.match(msg,/\[DRM-1\]/);
  assert.ok(!msg.includes('/40')&&!msg.includes('earns'));
  assert.match(msg,/Total: ₦80,000[^\n]*\nDelivery from Abuja: paid on delivery/);
  assert.match(message(shop,''),/Agent: DIRECT/);
  assert.match(message(agent),/earns ₦4,000 each/);
});
const c=vm.createContext({tl:r=>r.tl});
vm.runInContext(section(book,'function profitReport(','async function loadProfit('),c);
const calc=(orders,items=[{ref:'HIDDEN',model:'Hidden slide',tl:100,kg:.5}],costs={},params={rate:30,perKg:12000,handling:1500},now=new Date('2026-10-31T12:00:00Z'))=>JSON.parse(JSON.stringify(c.profitReport(orders,items,costs,params,r=>r.kg,now)));
const order=(paid,items,status='paid')=>({id:paid,paid,at:'2026-01-01',status,items});
const item={ref:'HIDDEN',qty:2,price:20000,comm:2000};
test('profit includes hidden styles, subtracts per-item costs/commission and never delivery',()=>{
  const result=calc([{...order('2026-10-30',[item]),delivery:999999}]).week;
  assert.equal(result.orders,1);assert.equal(result.items,2);assert.equal(result.revenue,40000);
  assert.equal(result.net,15000);assert.equal(result.average,7500);
  assert.equal(result.styles[0].ref,'HIDDEN');
});
test('unknown costs are excluded from net, kept in revenue, and listed separately without guesses',()=>{
  const result=calc([order('2026-10-30',[item,{ref:'UNKNOWN',qty:1,price:50000,comm:4000}])]).week;
  assert.equal(result.revenue,90000);assert.equal(result.net,15000);assert.equal(result.known,2);
  assert.equal(result.unknown.length,1);assert.equal(result.unknown[0].ref,'UNKNOWN');
  assert.equal(calc([order('2026-10-30',[item])],[{ref:'HIDDEN',tl:null,kg:.5}]).week.known,0);
  assert.equal(calc([order('2026-10-30',[item])],undefined,{HIDDEN:{tl:200}}).week.net,9000);
});
test('paid date, Nigeria Monday week and rolling 28 days exclude unpaid, future and invalid dates',()=>{
  const report=calc([order('2026-10-30',[item]),order('2026-10-25',[item]),order('2026-10-04',[item]),order('2026-10-03',[item]),order('2026-11-01',[item]),order('2026-10-30',[item],'waiting'),order('bad',[item]),order('2026-10-30',[item],'cancelled')]);
  assert.equal(report.week.orders,1);assert.equal(report.fourWeeks.orders,3);assert.equal(report.undated,1);
  assert.equal(calc([order('2026-11-02',[item])],undefined,undefined,undefined,new Date('2026-11-01T23:30:00Z')).week.orders,1);
});
test('missing commission/invalid quantities never produce invented net',()=>{
  const r=calc([order('2026-10-30',[{...item,comm:null},{...item,qty:-1}])]).week;
  assert.equal(r.net,0);assert.equal(r.average,null);assert.equal(r.unknown.length,2);
});
test('Profit loader is read-only and all UI sections compile without private build data',()=>{
  assert.ok(!/ghPut|saveJson|localStorage|LS\.set/.test(section(book,'function profitReport(','// ---------- end profit')));
  assert.match(book,/data-tab="profit"/);assert.match(book,/data-panel="profit"/);
  for(const html of [shop,agent,builtBook])for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
});
test('Derimod listing cleanup is identical across pages and source generator; material is never inferred from brand',()=>{
  const helper=section(shop,'function listingQuality(','\n}').concat('\n}');
  assert.ok(agent.includes(helper));assert.ok(read('tools/sourcing/engine.mjs').includes(helper));
  const cx=vm.createContext({});vm.runInContext(helper,cx);
  assert.equal(cx.listingQuality({brand:'Derimod',model:'Slide',kind:'slide',name:'Erkek deri terlik'}).model,'Leather slide');
  assert.equal(cx.listingQuality({brand:'Derimod',model:'Slide',kind:'slide',desc:'Suni deri'}).model,'Faux leather slide');
  assert.equal(cx.listingQuality({brand:'Derimod',model:'Slide',kind:'slide'}).model,'Slip-on slide');
  assert.equal(cx.listingQuality({brand:'Other',model:'Slide'}).model,'Slide');
  assert.equal(cx.listingQuality({desc:'Confirm size, material and delivery before payment..'}).desc,'Confirm size, material and delivery before payment.');
  const snapshot={source:'derimod',base:'https://derimod.com.tr',currency:'TRY',observed_at:new Date().toISOString(),products:[{id:1,title:'Erkek Siyah Deri Terlik',product_type:'Terlik',vendor:'Derimod',handle:'test',options:[{name:'Renk',position:1},{name:'Beden',position:2}],images:[{id:1,src:'https://cdn.example.com/a.jpg'}],variants:[{id:2,option1:'Siyah',option2:'42',available:true,price:'500'}]}]};
  assert.equal(normalize(snapshot)[0].item.model,'Leather slide');
  assert.match(shop,/trim\(\)\.replace\(\/\[\.\!\?\]\+\$\//);
});
test('customer message parses into Orders with attribution and a commission check',()=>{
  const html=read('orders/index.html'),ctx=vm.createContext({PRICES:{'DRM-1':[40000,4000]},CAT:new Map(),N:n=>'₦'+n,today:()=> '2026-10-31'});
  vm.runInContext(section(html,'const money=','$("parseBtn")'),ctx);
  const parsed=ctx.parseOrders(message(shop))[0];
  assert.equal(parsed.agent,'AMINA');assert.equal(parsed.items[0].comm,4000);
  assert.equal(parsed.items[0].price,40000);assert.equal(parsed.items[0].qty,2);
  assert.ok(parsed.problems.some(s=>s.includes('No commission in the text')));
});
