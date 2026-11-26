import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import Past from '../../orders/past-orders.js';

const orders=fs.readFileSync(new URL('../../orders/index.html',import.meta.url),'utf8');
const agent=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../../orders/past-orders-ui.js',import.meta.url),'utf8');
const rows=['2026-11-26','2026-11-27','2026-12-04'];
const catalogue=[{ref:'SHOE',model:'Shoe',sizes:['42']}];
const options={catalogue,prices:{SHOE:[40000,4000]},agents:['AMINA'],today:'2026-12-05'};

test('manual and past imports pay zero after cutoff, including edited commissions',()=>{
  for(const date of rows){
    const parsed=Past.parse(`${date},SHOE,42,1,40000,AMINA`,options);
    const expected=date<'2026-11-27'?4000:0;
    assert.equal(parsed[0].commission,expected);
    parsed[0].commission=9000;
    assert.equal(Past.resolve(parsed,options).orders[0].items[0].comm,expected?9000:0);
  }
  assert.match(ui,/row\.inputDate<'2026-11-27'/);
  assert.match(ui,/if\(rec\.at>='2026-11-27'\)rec\.items\.forEach\(it=>it\.comm=0\)/);
});

test('orders and agent earnings preserve older payouts but ignore later orders even with stored commission',()=>{
  const ctx=vm.createContext({DATA:{agents:['AMINA'],orders:[],payouts:[]},NLPastOrders:Past});
  vm.runInContext(orders.slice(orders.indexOf('const COMMISSION_END='),orders.indexOf('function drawPreview(')),ctx);
  vm.runInContext(orders.slice(orders.indexOf('function earnings(who)'),orders.indexOf('function drawAgents()')),ctx);
  const data={agents:['AMINA'],orders:[],payouts:[]};
  const start=agent.indexOf('function earningsOf('),end=agent.indexOf('function earnBox()',start);
  vm.runInContext(agent.slice(start,end),ctx);
  data.orders=rows.map((at,index)=>({id:String(index),at,paid:'2026-12-05',agent:'AMINA',status:'paid',items:[{qty:1,comm:4000}]}));
  ctx.DATA=data;
  assert.equal(vm.runInContext('commOf',ctx)(data.orders[0]),4000);
  for(const order of data.orders.slice(1))assert.equal(vm.runInContext('commOf',ctx)(order),0);
  assert.equal(ctx.earnings('AMINA').earned,4000);
  assert.equal(ctx.earnings('AMINA').items,1);
  assert.equal(ctx.earningsOf(data,'AMINA').earned,4000);
  assert.equal(ctx.earningsOf(data,'AMINA').items,1);
  data.orders=data.orders.slice(1);
  assert.equal(ctx.earnings('AMINA').earned,0);
  assert.equal(ctx.earningsOf(data,'AMINA').earned,0);
});

test('WhatsApp imports on and after the cutoff never suggest a commission',()=>{
  const ctx=vm.createContext({DATA:{agents:['AMINA']},NLPastOrders:Past,PRICES:{SHOE:[40000,4000]},CAT:new Map(),today:()=> '2026-11-27',N:String});
  vm.runInContext(orders.slice(orders.indexOf('const money='),orders.indexOf('let PARSED=')),ctx);
  for(const suffix of ['', ' · earns ₦4,000']){
    const imported=ctx.parseOrders(`NORTHLINE ORDER\nAgent: AMINA\n1. Shoe · Black · size 42 · x1 · ₦40,000 [SHOE${suffix}]`)[0];
    assert.equal(imported.items[0].comm,0);
    assert.equal(imported.problems.length,0);
  }
});
