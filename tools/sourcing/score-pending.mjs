// Order the weekly robot's `pending` list by the owner's approval model, without dropping anything.
//   node tools/sourcing/score-pending.mjs <robot-state.json> <model.json|-> [prices.json] [--write]
// - model.json is the public file the book publishes (train() output). If it is missing, inactive or the
//   wrong version, the order is left exactly as it is.
// - Only new styles move. They stay inside their section (M, W, B, AC) and every colour of a style (grp)
//   stays together; groups are ordered by their best colour's score. Price changes and sold-out items keep
//   their place after the new styles. Nothing is added, removed or edited (no score field is written).
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {features, predict, validModel} from './ranking.mjs';
const require=createRequire(import.meta.url), G=require('../extension/guess.js');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));

export function scoreItem(item,model,params){
  const kg=item.kg||G.KG[item.cat]||G.KG.shoes;
  const estimate=G.estimate(item.tl,kg,params);
  if(!estimate) return null;
  // Missing sizes count as zero coverage, as in the book's decision capture.
  return predict(model,features({...item,cat:item.cat||'shoes',sizes:item.sizes||[]},estimate));
}

export function orderPending(pending,model,params){
  if(!validModel(model)) return {pending,changed:false,reason:'model missing or inactive: order unchanged'};
  const SECTION=['M','W','B','AC'], sec=x=>{const i=SECTION.indexOf(x.g);return i<0?SECTION.length:i;};
  const isNew=x=>!x.t||x.t==='new';
  const news=pending.filter(isNew), rest=pending.filter(x=>!isNew(x));
  const groups=new Map();
  news.forEach((x,i)=>{
    const k=sec(x)+'|'+(x.grp||x.ref);
    if(!groups.has(k)) groups.set(k,{section:sec(x),first:i,best:-1,items:[]});
    const g=groups.get(k), s=scoreItem(x,model,params);
    g.items.push(x); if(s!=null&&s>g.best) g.best=s;
  });
  // Unscorable groups (no price) keep their old relative place at the end of their section.
  const ordered=[...groups.values()].sort((a,b)=>a.section-b.section||b.best-a.best||a.first-b.first).flatMap(g=>g.items);
  const out=[...ordered,...rest];
  if(out.length!==pending.length) throw new Error('item count changed: refusing to reorder');
  return {pending:out,changed:out.some((x,i)=>x!==pending[i]),reason:`ranked ${groups.size} new styles by the approval model`};
}

if(import.meta.url===`file://${process.argv[1]}`){
  const [statePath,modelPath,pricesPath]=process.argv.slice(2).filter(a=>!a.startsWith('--')), write=process.argv.includes('--write');
  if(!statePath){ console.error('usage: score-pending.mjs <robot-state.json> <model.json|-> [prices.json] [--write]'); process.exit(1); }
  const state=read(statePath);
  const model=modelPath&&modelPath!=='-'&&fs.existsSync(modelPath)?read(modelPath):null;
  const params=pricesPath&&fs.existsSync(pricesPath)?read(pricesPath).params:undefined;
  const r=orderPending(state.pending||[],model,params);
  console.log(`${r.reason}; ${r.changed?'order changed':'order unchanged'}; ${r.pending.length} items`);
  if(write&&r.changed){ state.pending=r.pending; fs.writeFileSync(statePath,JSON.stringify(state,null,1)); }
}
