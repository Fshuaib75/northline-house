// Approval preference model, not a demand or sales forecast. No dependencies or network.
export const VERSION = 1;
export const FEATURES = ['priceFit','profit','sizeCoverage','freightEfficiency','neutral','shoes','bags','clothing'];
const clamp = n => Math.max(0, Math.min(1, n));
export function features(item, estimate) {
  return [clamp(1-Math.max(0,estimate.price-50000)/100000), clamp(estimate.profit/20000),
    item.cat==='bags'?1:clamp(item.sizes.length/6), clamp(1-estimate.freightShare),
    ['Black','Brown','Tan & camel','Beige & nude','White','Grey'].includes(item.fam)?1:0,
    ...['shoes','bags','clothing'].map(cat=>Number(item.cat===cat))];
}
export function baseline(x) { return clamp(.35*x[0]+.25*x[1]+.20*x[2]+.15*x[3]+.05*x[4]); }
const sigmoid = z => 1/(1+Math.exp(-Math.max(-35,Math.min(35,z))));
export function predict(model,x) { return sigmoid(model.weights[0]+x.reduce((s,v,i)=>s+v*model.weights[i+1],0)); }
export function validFeatures(x) { return Array.isArray(x)&&x.length===FEATURES.length&&x.every(v=>Number.isFinite(v)&&v>=0&&v<=1); }
export function validModel(m) { return m?.version===VERSION&&m?.active===true&&Array.isArray(m.weights)&&m.weights.length===FEATURES.length+1&&m.weights.every(Number.isFinite); }
function hash(text) { let h=2166136261;for(const c of text)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0; }
function metrics(rows, score) {
  let loss=0,tp=0,tn=0,p=0,n=0;
  for(const r of rows) { const s=score(r.x);loss+=(s-r.y)**2;if(r.y){p++;tp+=s>=.5;}else{n++;tn+=s<.5;} }
  return {brier:loss/rows.length,balancedAccuracy:(tp/p+tn/n)/2,positive:p,negative:n};
}
export function train(feedback) {
  const unique=new Map();
  for(const row of feedback) {
    if(!row.id||!row.product_key||!['approve','reject'].includes(row.decision)||row.feature_version!==VERSION||!validFeatures(row.features)) continue;
    unique.set(row.id,{id:row.id,group:row.product_key,x:row.features,y:Number(row.decision==='approve')});
  }
  const rows=[...unique.values()], counts={positive:rows.filter(r=>r.y).length,negative:rows.filter(r=>!r.y).length};
  const inactive = reason=>({version:VERSION,active:false,reason,examples:rows.length,...counts,features:FEATURES});
  if(rows.length<50||Math.min(counts.positive,counts.negative)<15)return inactive('Need at least 50 unique decisions, including 15 approvals and 15 rejections.');
  // Keep every colour/variant of a product on the same side of the holdout.
  const test=rows.filter(r=>hash(r.group)%5===0), fit=rows.filter(r=>hash(r.group)%5!==0);
  if([test,fit].some(rs=>rs.filter(r=>r.y).length<5||rs.filter(r=>!r.y).length<5))return inactive('Need more independent products in both classes for a grouped holdout.');
  const weights=Array(FEATURES.length+1).fill(0);
  for(let epoch=0;epoch<1000;epoch++) {
    const gradient=weights.map(()=>0);
    for(const row of fit){const x=[1,...row.x],error=predict({weights},row.x)-row.y;x.forEach((v,i)=>gradient[i]+=error*v);}
    weights.forEach((_,i)=>weights[i]-=.2*(gradient[i]/fit.length+(i?.01*weights[i]:0)));
  }
  const learned=metrics(test,x=>predict({weights},x)), rules=metrics(test,baseline);
  const active=learned.brier<rules.brier&&learned.balancedAccuracy>rules.balancedAccuracy+.02;
  return {version:VERSION,active,weights,features:FEATURES,examples:rows.length,training:fit.length,holdout:test.length,
    metrics:{learned,baseline:rules},reason:active?'Improved held-out approval ranking; advisory only.':'Baseline retained: model did not improve both held-out metrics.'};
}
