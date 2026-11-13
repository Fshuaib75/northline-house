import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import Past from '../../orders/past-orders.js';
const html=fs.readFileSync(new URL('../../orders/index.html',import.meta.url),'utf8');
test('agent page never shows marketing-source earnings',()=>{
 const agent=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
 const start=agent.indexOf('function earningsOf('),end=agent.indexOf('\n}',start)+2;
 const source=agent.slice(start,end);
 const ctx=vm.createContext({});
 // Extract the balanced function independently of following UI code.
 let depth=0,finish=source.indexOf('{');for(let n=finish;n<agent.length-start;n++){const c=agent[start+n];if(c==='{')depth++;if(c==='}'&&!--depth){finish=n+1;break;}}
 vm.runInContext(agent.slice(start,start+finish),ctx);
 for(const code of ['IG','FB','WA','ADMIN','DIRECT','UNKNOWN'])assert.equal(ctx.earningsOf({agents:['AMINA'],orders:[{agent:code,status:'paid',items:[{qty:1,comm:4000}]}]},code),null);
 assert.equal(ctx.earningsOf({agents:['AMINA'],orders:[{agent:'AMINA',status:'paid',items:[{qty:1,comm:4000}]}]},'AMINA').earned,4000);
});
test('marketing orders retain source and never earn even with explicit commission',()=>{
 const ctx=vm.createContext({DATA:{agents:['AMINA']},NLPastOrders:Past,PRICES:{TEST:[40000,4000]},CAT:new Map(),today:()=> '2026-11-13',N:String});
 vm.runInContext(html.slice(html.indexOf('const money='),html.indexOf('let PARSED=')),ctx);
 for(const code of ['IG','FB','WA','ADMIN','DIRECT','ig','UNKNOWN'])for(const suffix of ['', ' · earns ₦4,000']){
  const o=ctx.parseOrders(`NORTHLINE ORDER (shop)\nAgent: ${code}\n1. Slide · Black · size 42 · x1 · ₦40,000 [TEST${suffix}]`)[0];
  assert.equal(o.agent,'',code);assert.ok(o.channel,code);assert.equal(o.items[0].comm,0,code);
 }
});
