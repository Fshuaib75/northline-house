import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import Past from '../../orders/past-orders.js';

const catalogue=[
  {ref:'SLZ-SA16SE030-500',model:'Plain slide',colour:'Black',brand:'Salaz',on:false},
  {ref:'SLZ-BROWN',model:'Plain slide',colour:'Brown',brand:'Salaz'},
  {ref:'OLD-1',model:'Old sandal',colour:'Tan',brand:'Old',hidden:true},
  {ref:'QUOTED',model:'Soft, "everyday" slide',colour:'Black',brand:'Comma'}
];
const options=()=>({catalogue,prices:{'SLZ-SA16SE030-500':[35000,4000],'SLZ-BROWN':[40000,3000]},agents:['AMINA-KD'],today:'2026-11-01',idFactory:(()=>{let n=0;return()=>`test-${++n}`;})()});
const line=(ref='SLZ-SA16SE030-500',channel='Direct',date='2026-09-14',qty=1,price=30000)=>`${date}, ${ref}, 42, ${qty}, ${price}, ${channel}`;
const result=(text,opts=options())=>Past.resolve(Past.parse(text,opts),opts);

test('past sales match case-insensitive refs including unavailable styles, save paid on order date',()=>{
  const r=result(line('slz-sa16se030-500'));
  assert.deepEqual(r.errors,[]);assert.equal(r.orders.length,1);
  assert.equal(r.orders[0].at,'2026-09-14');assert.equal(r.orders[0].paid,'2026-09-14');assert.equal(r.orders[0].status,'paid');
  assert.equal(r.orders[0].items[0].ref,'SLZ-SA16SE030-500');assert.equal(r.orders[0].items[0].comm,0);
  assert.equal(r.orders[0].agent,'');assert.equal(r.orders[0].channel,'Direct');
  assert.equal(result(line('Old sandal')).orders[0].items[0].ref,'OLD-1');
});
test('matching prefers exact refs and flags ambiguous catalogue names without a fuzzy guess',()=>{
  assert.equal(Past.matchStyle('Plain slide',catalogue).match,'ambiguous');
  assert.equal(Past.matchStyle('Plain slide',catalogue).candidates.length,2);
  assert.equal(Past.matchStyle('Plain slide · Black',catalogue).item.ref,'SLZ-SA16SE030-500');
  assert.equal(Past.matchStyle('Salaz / Plain slide / Brown',catalogue).item.ref,'SLZ-BROWN');
  assert.equal(Past.matchStyle('Plain slid',catalogue).match,'unmatched');
  const opts=options(),rows=Past.parse(line('Plain slide'),opts);
  assert.equal(Past.resolve(rows,opts).orders.length,0);
  rows[0].item=rows[0].candidates.find(i=>i.ref==='SLZ-BROWN');
  assert.equal(Past.resolve(rows,opts).orders[0].items[0].ref,'SLZ-BROWN');
});
test('unlisted styles require explicit free-text confirmation and never get a fake reference',()=>{
  const opts=options(),rows=Past.parse(line('Retired canvas shoe'),opts);
  assert.match(rows[0].errors.join(' '),/No catalogue match/);
  assert.equal(Past.resolve(rows,opts).orders.length,0);rows[0].freeText=true;
  const it=Past.resolve(rows,opts).orders[0].items[0];
  assert.deepEqual({ref:it.ref,model:it.model,brand:it.brand,colour:it.colour},{ref:'',model:'Retired canvas shoe',brand:'',colour:''});
});
test('CSV accepts quoted commas and quotes, BOM, CRLF, whitespace and optional header',()=>{
  const opts=options(),rows=Past.parse('\uFEFFdate, style ref or name, size, qty, price, channel\r\n\r\n2026-09-14, "Soft, ""everyday"" slide", 42, 2, 30000, Direct\r\n',opts);
  assert.equal(rows.length,1);assert.equal(rows[0].line,3);assert.equal(rows[0].item.ref,'QUOTED');
  assert.equal(Past.resolve(rows,opts).total,60000);
});
test('malformed CSV remains visible and blocks the whole batch',()=>{
  for(const bad of ['2026-09-14, "Unclosed, 42, 1, 30000, Direct',line()+', extra','2026-09-14, "name"bad, 42, 1, 30000, Direct','2026-09-14,na"me,42,1,30000,Direct']){
    const r=result(line()+'\n'+bad);assert.equal(r.rows.length,2);assert.equal(r.orders.length,0);assert.ok(r.errors.some(e=>e.startsWith('Line 2:')));
  }
});
test('date validation rejects impossible or future dates and accepts leap days and very old orders',()=>{
  for(const day of ['2026-02-29','2026-04-31','2026-13-01','2026-9-01','2026-11-02','0000-01-01','']) assert.equal(result(line(undefined,undefined,day)).orders.length,0,day);
  for(const day of ['2024-02-29','1999-01-01','2026-11-01']) assert.equal(result(line(undefined,undefined,day)).orders[0].paid,day);
});
test('invalid numbers never silently round or fall back, and zero-price items stay zero',()=>{
  for(const qty of ['0','-1','1.5','2x','1e3','100001']) assert.equal(result(line(undefined,undefined,undefined,qty)).orders.length,0,qty);
  for(const price of ['-1','1.5','30k','Infinity','1e4','1000000001','']) assert.equal(result(line(undefined,undefined,undefined,1,price)).orders.length,0,price);
  const r=result(line(undefined,undefined,undefined,2,0));assert.equal(r.total,0);assert.equal(r.units,2);assert.equal(r.orders[0].items[0].price,0);
});
test('same date and canonical channel groups all lines; separate dates and channels remain separate',()=>{
  const r=result([line(),line('SLZ-BROWN','direct'),line('OLD-1','Instagram'),line('OLD-1','IG'),line('OLD-1','Direct','2026-09-15')].join('\n'));
  assert.equal(r.orders.length,3);assert.equal(r.orders[0].items.length,2);assert.equal(r.orders[1].items.length,2);assert.equal(r.total,150000);assert.equal(r.units,5);
  assert.deepEqual(r.orders.map(o=>o.channel),['Direct','Instagram','Direct']);
});
test('social and direct channels never become commission-earning agents even if named in known agents',()=>{
  for(const channel of ['Direct','IG','Instagram','FB','Facebook','WhatsApp','WA','TikTok','Website','Shop','Walk-in']){
    const opts={...options(),agents:[channel]},rows=Past.parse(line(undefined,channel),opts);
    rows[0].channelType='agent';rows[0].commission=4000;
    const rec=Past.resolve(rows,opts).orders[0];assert.equal(rec.agent,'',channel);assert.equal(rec.items[0].comm,0,channel);
  }
});
test('known agent code uses per-item commission, shown as editable and retained for past paid date',()=>{
  const opts=options(),rows=Past.parse(line(undefined,'amina-kd',undefined,2),opts);
  assert.equal(rows[0].commission,4000);assert.equal(rows[0].channelType,'agent');
  rows[0].commission='1500';const rec=Past.resolve(rows,opts).orders[0];
  assert.equal(rec.agent,'AMINA-KD');assert.equal(rec.channel,'AMINA-KD');assert.equal(rec.items[0].comm,1500);assert.equal(rec.items[0].qty,2);assert.equal(rec.paid,'2026-09-14');
});
test('unknown channels require explicit classification; new valid agent codes can be confirmed',()=>{
  const opts=options(),rows=Past.parse(line(undefined,'NEW-AGENT'),opts);
  assert.equal(rows[0].channelType,'unknown');assert.equal(Past.resolve(rows,opts).orders.length,0);
  rows[0].channelType='agent';rows[0].commission=2500;assert.equal(Past.resolve(rows,opts).orders[0].agent,'NEW-AGENT');
  rows[0].channelType='channel';assert.equal(Past.resolve(rows,opts).orders[0].items[0].comm,0);
  assert.equal(Past.resolve(rows,opts).orders[0].agent,'');
  rows[0].channelType='agent';rows[0].channel='bad code';assert.equal(Past.resolve(rows,opts).orders.length,0);
});
test('missing agent rate requires explicit amount, including legacy styles; excessive or invalid commission blocks saving',()=>{
  const opts=options(),rows=Past.parse(line('OLD-1','AMINA-KD'),opts);
  assert.equal(rows[0].commission,null);assert.equal(Past.resolve(rows,opts).orders.length,0);
  for(const comm of [-1,30001,'no','']){rows[0].commission=comm;assert.equal(Past.resolve(rows,opts).orders.length,0);}
  rows[0].commission=0;assert.equal(Past.resolve(rows,opts).orders[0].items[0].comm,0);
  const old=Past.parse(line('Legacy shoe','AMINA-KD'),opts);old[0].freeText=true;old[0].commission=1000;
  assert.equal(Past.resolve(old,opts).orders[0].items[0].comm,1000);
});
test('resolve is nonmutating and an edited invalid value prevents any partial save',()=>{
  const opts=options(),catBefore=JSON.stringify(catalogue),rows=Past.parse(line()+'\n'+line('SLZ-BROWN'),opts),before=JSON.stringify(rows);
  const r=Past.resolve(rows,opts);assert.equal(JSON.stringify(rows),before);assert.equal(JSON.stringify(catalogue),catBefore);
  r.orders[0].items[0].model='Changed';assert.equal(rows[0].item.model,'Plain slide');
  rows[1].inputDate='future';const invalid=Past.resolve(rows,opts);assert.equal(invalid.orders.length,0);assert.equal(invalid.total,0);assert.match(invalid.errors[0],/Line 2/);
});
test('empty input cannot save and raw fields cannot smuggle extra saved customer attributes',()=>{
  assert.equal(result('\n').orders.length,0);assert.ok(result('').errors.length);
  const opts=options(),rows=Past.parse(line(),opts);rows[0].name='Private customer';rows[0].phone='12345';rows[0].address='Private street';
  const json=JSON.stringify(Past.resolve(rows,opts).orders);assert.ok(!json.includes('Private'));assert.ok(!json.includes('12345'));
});
test('the browser bundle exports the same pure interface without requiring Node',()=>{
  const ctx=vm.createContext({Date,Math,Map,Set});vm.runInContext(fs.readFileSync(new URL('../../orders/past-orders.js',import.meta.url),'utf8'),ctx);
  assert.equal(typeof ctx.NLPastOrders.parse,'function');assert.equal(typeof ctx.NLPastOrders.resolve,'function');
  assert.equal(ctx.NLPastOrders.validDate('2024-02-29','2026-11-01'),true);
});
