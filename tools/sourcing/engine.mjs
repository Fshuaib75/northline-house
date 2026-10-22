import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {FEATURES, VERSION, features, baseline, predict, validModel, train} from './ranking.mjs';
const require=createRequire(import.meta.url), G=require('../extension/guess.js');
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const low=s=>String(s||'').toLocaleLowerCase('tr');
const clean=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
export const SOURCES={derimod:{brand:'Derimod',base:'https://derimod.com.tr',vendors:['Derimod','Derimod D-Pack','Derimod Studio']},aldo:{brand:'Aldo',base:'https://www.aldoshoes.com.tr',vendors:['ALDO']},capone:{brand:'Capone',base:'https://www.caponeoutfitters.com.tr',vendors:['Capone Outfitters','Capone','Ippocampo']}};
const urlKey=u=>{try{const x=new URL(u);return x.origin+x.pathname.replace(/\/$/,'');}catch{return '';}};
const imageKey=u=>{try{return decodeURIComponent(new URL(u).pathname).replace(/_\d+x\d*(?=\.)/,'');}catch{return '';}};
function category(text) {
  if(/çanta|canta|\bbag\b|backpack|clutch|tote/.test(text))return 'bags';
  if(/terlik|sandalet|loafer|makosen|sneaker|babet|ayakkabı|ayakkabi|flip.flop/.test(text))return 'shoes';
  if(/gömlek|pantolon|elbise|tunik|abaya|ferace|hijab|eşarp|şal|tişört|bluz|takım/.test(text))return 'clothing';
  return null; // Unsupported categories require a reader and shipping model before inclusion.
}
function person(text) {if(/kadın|kadin|women|bayan/.test(text))return 'Women';if(/erkek|\bmen\b/.test(text))return 'Men';return null;}
function safeImage(url) {try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
export function normalize(snapshot, now=Date.now()) {
  const source=SOURCES[snapshot.source];
  if(!source||snapshot.base!==source.base||snapshot.currency!=='TRY')throw Error('Unrecognized supplier or currency');
  const stamp=Date.parse(snapshot.observed_at);
  if(!Number.isFinite(stamp)||now-stamp>48*3600000||stamp>now+300000)throw Error('Supplier snapshot must be dated within the past 48 hours');
  if(!Array.isArray(snapshot.products))throw Error('Invalid products list');
  const output=[];
  for(const p of snapshot.products) {
    if(!source.vendors.some(v=>low(v)===low(p.vendor)))continue;
    const brand=low(p.vendor)==='ippocampo'?'Ippocampo':source.brand;
    const text=low(`${p.title} ${p.product_type}`),cat=category(text),who=person(text);
    if(!cat||!who||!p.id||!p.handle||!/^[a-zA-Z0-9-]+$/.test(p.handle))continue;
    const options=p.options||[],colourOption=options.find(o=>/^(renk|color|colour)$/i.test(o.name)),sizeOption=options.find(o=>/^(beden|size|numara)$/i.test(o.name));
    const colours=new Map();
    for(const v of p.variants||[]) {
      if(v.available!==true||!Number.isFinite(Number(v.price))||Number(v.price)<=0)continue;
      const colour=colourOption?v[`option${colourOption.position}`]:G.guessColour('',p.title).colour;
      const size=sizeOption?v[`option${sizeOption.position}`]:null;
      if(!colour||!size)continue; // Never manufacture stock or use fallback sizes.
      if(!colours.has(colour))colours.set(colour,[]);
      colours.get(colour).push({...v,_size:/^(standart|std|tek beden)$/i.test(size)?'One size':String(size).replace(',','.')});
    }
    for(const [colour,variants] of colours) {
      if(new Set(variants.map(v=>Number(v.price))).size!==1)continue; // Price differs by size: owner must inspect.
      const c=G.guessColour(colour,p.title),kind=G.guessKind(cat,p.title);
      if(!c.fam)continue;
      const linked=(p.images||[]).filter(im=>variants.some(v=>v.featured_image?.id===im.id||(im.variant_ids||[]).includes(v.id)));
      if(colours.size>1&&!linked.length)continue; // Avoid assigning another colour's photograph.
      const imgs=(linked.length?linked:p.images||[]).map(im=>safeImage(im.src)).filter(Boolean);
      if(!imgs.length)continue;
      const sizes=[...new Set(variants.map(v=>v._size))];
      const digest=createHash('sha256').update(String(colour)).digest('hex').slice(0,8).toUpperCase();
      const item={t:'new',ref:`${G.brandCode(brand)}-${p.id}-${digest}`,brand,cat,g:G.lineOf(cat,who),for:who,
        model:G.guessModel(p.title,cat,kind),colour:c.colour,fam:c.fam,kind,heel:G.guessHeel(p.title),
        desc:'Confirm size, material and delivery before payment.',tl:Number(variants[0].price),kg:G.KG[kind]||G.KG[cat],
        img:imgs[0],imgs:imgs.slice(0,8),sizes,page:`${source.base}/products/${p.handle}`};
      output.push({id:`${snapshot.source}:${p.id}:${digest}`,product_key:`${snapshot.source}:${p.id}`,item,
        evidence:{observed_at:snapshot.observed_at,title:clean(p.title),supplier:source.base,product_id:String(p.id),
          skus:variants.map(v=>v.sku).filter(Boolean),currency:'TRY',weight_estimated:true,classification:'suggested; owner review required'}});
    }
  }
  return output;
}
export function rank(candidates, existing, params, model=null, limit=60) {
  for(const k of ['rate','perKg','handling','minProfit','profitPct'])if(!Number.isFinite(params?.[k])||params[k]<0)throw Error(`Missing/invalid pricing parameter: ${k}`);
  if(params.rate<=0)throw Error('Exchange rate must be positive');
  const refs=new Set(existing.map(i=>i.ref)),pages=new Set(existing.map(i=>urlKey(i.page)).filter(Boolean)),images=new Set(existing.flatMap(i=>[i.img,...i.imgs||[]]).map(imageKey).filter(Boolean));
  const seen=new Set(),eligible=[],excluded={known:0,duplicate:0,expensive:0};
  for(const candidate of candidates) {
    const {item}=candidate;
    if(refs.has(item.ref)||pages.has(urlKey(item.page))||[item.img,...item.imgs].some(u=>images.has(imageKey(u)))){excluded.known++;continue;}
    if(seen.has(candidate.id)){excluded.duplicate++;continue;}seen.add(candidate.id);
    const estimate=G.estimate(item.tl,item.kg,params);
    if(!estimate||estimate.price>100000){excluded.expensive++;continue;}
    const x=features(item,estimate),useML=validModel(model),score=useML?predict(model,x):baseline(x);
    eligible.push({...candidate,estimate,features:x,feature_version:VERSION,score,method:useML?'learned approval preference':'margin and stock rules',
      reasons:[`Estimated selling price ₦${estimate.price.toLocaleString('en')}`,`Estimated owner profit ₦${Math.round(estimate.profit).toLocaleString('en')}`,`${item.sizes.length} available size option(s)`,
        ...(estimate.price>65000?['Above the usual ₦65k review threshold']:[]),...(estimate.profit<5000?['Profit below ₦5,000']:[])]});
  }
  eligible.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  // Round-robin across brands: a large supplier cannot occupy every review slot.
  const groups=new Map();for(const c of eligible){if(!groups.has(c.item.brand))groups.set(c.item.brand,[]);groups.get(c.item.brand).push(c);}
  const selected=[];while(selected.length<limit&&[...groups.values()].some(g=>g.length)){for(const g of groups.values())if(g.length&&selected.length<limit)selected.push(g.shift());}
  return {candidates:selected,eligible:eligible.length,excluded,model:validModel(model)?'learned':'rules'};
}
function existingCatalogue(root) {
  const html=fs.readFileSync(path.join(root,'shop/index.html'),'utf8'),match=html.match(/let ALL = (\[.*?\]);\n/s);
  if(!match)throw Error('Embedded catalogue could not be read; refusing to skip deduplication');
  return [...JSON.parse(match[1]),...read(path.join(root,'products.json'))];
}
export function build(snapshotDir,outDir,modelPath=null,limit=60) {
  const all=[],sources=[];
  for(const key of Object.keys(SOURCES)) {
    const p=path.join(snapshotDir,key+'.json');if(!fs.existsSync(p))continue;
    const s=read(p);all.push(...normalize(s));sources.push({source:key,products:s.products.length,complete:s.complete,errors:s.errors});
  }
  if(!sources.length)throw Error('No supplier snapshots found');
  const result=rank(all,existingCatalogue(ROOT),read(path.join(ROOT,'prices.json')).params,modelPath?read(modelPath):null,limit);
  result.generated_at=new Date().toISOString();result.sources=sources;result.normalized=all.length;
  fs.mkdirSync(outDir,{recursive:true});fs.writeFileSync(path.join(outDir,'candidates.json'),JSON.stringify(result,null,2));
  const template=fs.readFileSync(new URL('review.html',import.meta.url),'utf8');
  fs.writeFileSync(path.join(outDir,'review.html'),template.replace('/*CANDIDATE_DATA*/null',JSON.stringify(result).replace(/</g,'\\u003c')));
  console.log(JSON.stringify({selected:result.candidates.length,eligible:result.eligible,excluded:result.excluded,brands:[...new Set(result.candidates.map(c=>c.item.brand))],model:result.model,sources},null,2));
  return result;
}
function cli(args) {
  const [command,...rest]=args;
  if(command==='build') {if(rest.length<2)throw Error('build SNAPSHOT_DIR OUTPUT_DIR [MODEL_JSON]');build(rest[0],rest[1],rest[2]);}
  else if(command==='train') {if(rest.length<2)throw Error('train OUTPUT_MODEL FEEDBACK_JSON...');const [output,...files]=rest;const rows=files.flatMap(p=>read(p).decisions||[]);const model=train(rows);fs.writeFileSync(output,JSON.stringify(model,null,2));console.log(JSON.stringify(model,null,2));}
  else console.log('Northline sourcing engine\nCollect: python tools/sourcing/collect.py --output /tmp/nl-sources --pages 4\nReview: node tools/sourcing/engine.mjs build /tmp/nl-sources /tmp/nl-review [model.json]\nLearn: node tools/sourcing/engine.mjs train /tmp/nl-model.json feedback.json...\nOpen review.html; approve/reject then download review findings and feedback. Findings use the owner inbox schema; publishing remains owner-controlled.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{cli(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}}
