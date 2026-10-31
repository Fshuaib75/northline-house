import test from 'node:test';
import assert from 'node:assert/strict';
import {orderPending} from './score-pending.mjs';
import {FEATURES} from './ranking.mjs';

const P={rate:30,perKg:12000,handling:1500,minProfit:4000,profitPct:15};
// Model that strongly prefers cheaper items (priceFit weight high).
const model={version:1,active:true,weights:[0,8,...Array(FEATURES.length-1).fill(0)]};
const it=(ref,g,tl,extra={})=>({ref,g,tl,cat:'shoes',kind:'slide',sizes:['40','41'],...extra});
const pending=[
  it('W-EXP','W',3000,{grp:'W1'}),
  it('M-EXP-BLK','M',2500,{grp:'M1'}), it('M-EXP-BRN','M',2500,{grp:'M1'}),
  it('M-CHEAP','M',500,{grp:'M2'}),
  it('W-CHEAP','W',400,{grp:'W2'}),
  {ref:'M-EXP-BLK',t:'price',was:2500,now:2700},
  {ref:'OLD',t:'gone'},
];

test('inactive or missing model leaves order untouched',()=>{
  for(const m of [null,{...model,active:false},{...model,version:2}]){
    const r=orderPending(pending,m,P); assert.equal(r.changed,false); assert.deepEqual(r.pending,pending);
  }
});

test('active model sorts within sections, keeps colours together, keeps every item',()=>{
  const r=orderPending(pending,model,P);
  assert.equal(r.pending.length,pending.length);
  assert.deepEqual(r.pending.map(x=>x.ref),['M-CHEAP','M-EXP-BLK','M-EXP-BRN','W-CHEAP','W-EXP','M-EXP-BLK','OLD']);
  assert.equal(r.pending[5].t,'price'); assert.equal(r.pending[6].t,'gone');
});

test('items without a price or sizes are kept, not dropped',()=>{
  const p=[it('M-A','M',0,{grp:'A'}),it('M-B','M',600,{grp:'B',sizes:undefined})];
  const r=orderPending(p,model,P);
  assert.deepEqual(r.pending.map(x=>x.ref),['M-B','M-A']);
});
