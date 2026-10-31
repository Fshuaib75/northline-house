import fs from 'node:fs';
function listingQuality(item){
  let model=item.model||"", desc=(item.desc||"").replace(/([.!?])\1+$/,"$1");
  if(/^derimod$/i.test(item.brand||"")&&/^(slide|sandal|shoe|bag|terlik|sandalet)$/i.test(model.trim())){
    const text=[item.material,item.title,item.name,item.desc].filter(Boolean).join(" ").toLowerCase();
    const material=/\b(faux leather|suni deri|synthetic leather)\b/.test(text)?"Faux leather":/\b(leather|deri)\b/.test(text)?"Leather":/\b(suede|süet)\b/.test(text)?"Suede":"";
    const kind={slide:"slide",sandal:"sandal",loafer:"loafer",sneaker:"sneaker",crossbody:"crossbody bag",shoulder:"shoulder bag",handbag:"handbag",tote:"tote bag"}[item.kind]||model.toLowerCase();
    model=material?material+" "+kind:kind==="slide"?"Slip-on slide":kind.charAt(0).toUpperCase()+kind.slice(1);
  }
  return {...item,model,desc};
}
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {FEATURES, VERSION, features, baseline, predict, validModel, train} from './ranking.mjs';
import {minimalCheck} from './minimal.mjs';
const require=createRequire(import.meta.url), G=require('../extension/guess.js');
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const low=s=>String(s||'').toLocaleLowerCase('tr');
const clean=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
export const SOURCES=read(new URL('./sources.json',import.meta.url));
const urlKey=u=>{try{const x=new URL(u);return x.origin+x.pathname.replace(/\/$/,'');}catch{return '';}};
const imageKey=u=>{try{return decodeURIComponent(new URL(u).pathname).replace(/_\d+x\d*(?=\.)/,'');}catch{return '';}};
function category(text) {
  if(/çanta|canta|\bbag\b|backpack|clutch|tote/.test(text))return 'bags';
  if(/terlik|sandalet|loafer|makosen|sneaker|babet|ayakkabı|ayakkabi|flip.flop/.test(text))return 'shoes';
  if(/gömlek|pantolon|elbise|tunik|abaya|ferace|hijab|eşarp|şal|tişört|bluz|takım|\bshirts?\b|\bt-shirts?\b|\btees\b|\bpants\b|\bdresses\b|\bskirts?\b|\batlet\b|\betek\b/.test(text))return 'clothing';
  return null; // Unsupported categories require a reader and shipping model before inclusion.
}
function person(text,tags) {
  const words=tags.map(low);
  const women=/kadın|kadin|\bwomen\b|bayan/.test(text)||words.some(t=>['kadın','kadin','women','woman'].includes(t));
  const men=/erkek|\bmen\b/.test(text)||words.some(t=>['erkek','men','man'].includes(t));
  return women===men?null:women?'Women':'Men';
}
function safeImage(url) {try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
export function normalize(snapshot, now=Date.now()) {
  const source=SOURCES[snapshot.source];
  if(!source||snapshot.base!==source.base||snapshot.currency!=='TRY')throw Error('Unrecognized supplier or currency');
  const stamp=Date.parse(snapshot.observed_at);
  if(!Number.isFinite(stamp)||now-stamp>48*3600000||stamp>now+300000)throw Error('Supplier snapshot must be dated within the past 48 hours');
  if(!Array.isArray(snapshot.products))throw Error('Invalid products list');
  const output=[];
  for(const p of snapshot.products) {
    const vendor=Object.entries(source.vendors).find(([v])=>low(v)===low(p.vendor));
    if(!vendor)continue;
    const brand=vendor[1],tags=Array.isArray(p.tags)?p.tags:String(p.tags||'').split(',').map(t=>t.trim());
    const text=low(`${p.title} ${p.product_type}`);
    // Child sizing and heavy outerwear need their own shipping/classification rules.
    if(/bebek|çocuk|cocuk|\bkids?\b|\bbaby\b|\bceket\b|\bmont\b|\bkaban\b|\bjacket|\bcoat|\bbomber/.test(text))continue;
    const cat=category(text),who=person(text,tags)||source.audience;

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
      const listing=listingQuality({...item,title:p.title}); item.model=listing.model; item.desc=listing.desc;
      output.push({id:`${snapshot.source}:${p.id}:${digest}`,product_key:`${snapshot.source}:${p.id}`,item,
        evidence:{observed_at:snapshot.observed_at,title:clean(p.title),supplier:source.base,product_id:String(p.id),
          skus:variants.map(v=>v.sku).filter(Boolean),currency:'TRY',weight_estimated:true,classification:'suggested; owner review required'}});
    }
  }
  return output;
}
// Defaults keep the review short: 30 candidates, at most 5 from any one brand (owner decision, 24 Oct 2026).
// `photos` (optional) is the photo check from tools/sourcing/vision.py: {candidate id: {score, verdict, best_photo, loudest}}.
export function rank(candidates, existing, params, model=null, limit=30, perBrand=5, photos={}) {
  if(!Number.isInteger(limit)||limit<1||limit>500)throw Error('Review limit must be an integer from 1 to 500');
  if(!(perBrand===Infinity||Number.isInteger(perBrand)&&perBrand>=1))throw Error('Per-brand limit must be a whole number from 1');
  for(const k of ['rate','perKg','handling','minProfit','profitPct'])if(!Number.isFinite(params?.[k])||params[k]<0)throw Error(`Missing/invalid pricing parameter: ${k}`);
  if(params.rate<=0)throw Error('Exchange rate must be positive');
  const refs=new Set(existing.map(i=>i.ref)),pages=new Set(existing.map(i=>urlKey(i.page)).filter(Boolean)),images=new Set(existing.flatMap(i=>[i.img,...i.imgs||[]]).map(imageKey).filter(Boolean));
  const seen=new Set(),eligible=[],excluded={known:0,duplicate:0,expensive:0,notMinimal:0,loudPhoto:0,onlyPeoplePhotos:0};
  for(const candidate of candidates) {
    const {item}=candidate;
    if(refs.has(item.ref)||pages.has(urlKey(item.page))||[item.img,...item.imgs].some(u=>images.has(imageKey(u)))){excluded.known++;continue;}
    if(seen.has(candidate.id)){excluded.duplicate++;continue;}seen.add(candidate.id);
    if(!minimalCheck(item,candidate.evidence?.title).ok){excluded.notMinimal++;continue;}
    const photo=photos?.[candidate.id];
    if(photo?.verdict==='leave_out'){excluded.loudPhoto++;continue;}
    const estimate=G.estimate(item.tl,item.kg,params);
    if(!estimate||estimate.price>100000){excluded.expensive++;continue;}
    const x=features(item,estimate),useML=validModel(model),score=useML?predict(model,x):baseline(x);
    // Owner rule: product-only photos, never a person. Drop photos the check saw a person in; no clean photo, no candidate.
    const people=new Set(photo?.people_photos||[]),clean=item.imgs.filter(u=>!people.has(u));
    if(!clean.length){excluded.onlyPeoplePhotos++;continue;}
    const best=photo?.best_photo&&clean.includes(photo.best_photo)?photo.best_photo:clean[0];
    const shown=best!==item.img||clean.length!==item.imgs.length?{...candidate,item:{...item,img:best,imgs:[best,...clean.filter(u=>u!==best)]}}:candidate;
    eligible.push({...shown,photo:photo?{score:photo.score,verdict:photo.verdict}:undefined,estimate,features:x,feature_version:VERSION,score,method:useML?'learned approval preference':'margin and stock rules',
      reasons:[`Estimated selling price ₦${estimate.price.toLocaleString('en')}`,`Estimated owner profit ₦${Math.round(estimate.profit).toLocaleString('en')}`,`${item.sizes.length} available size option(s)`,
        ...(estimate.price>65000?['Above the usual ₦65k review threshold']:[]),...(estimate.profit<5000?['Profit below ₦5,000']:[]),
        ...(photo?.verdict==='check'?[`Photo may be loud: check (${photo.loudest||'photo check'})`]:[]),
        ...(photo?.verdict==='unchecked'?['Photo not checked (the supplier blocked the download): look closely']:[])]});
  }
  eligible.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  // Fair share per brand, rotating its categories and audiences within that share.
  const groups=new Map();
  for(const c of eligible){
    if(!groups.has(c.item.brand))groups.set(c.item.brand,new Map());
    const group=groups.get(c.item.brand),key=c.item.cat+':'+c.item.for;
    if(!group.has(key))group.set(key,[]);group.get(key).push(c);
  }
  const queues=[...groups.values()].map(g=>[...g.values()]).map(q=>Object.assign(q,{taken:0}));
  const selected=[],open=q=>q.length&&q.taken<perBrand;
  while(selected.length<limit&&queues.some(open))for(const queue of queues){
    if(!open(queue)||selected.length>=limit)continue;
    const bucket=queue.shift();selected.push(bucket.shift());queue.taken++;if(bucket.length)queue.push(bucket);
  }
  return {candidates:selected,eligible:eligible.length,excluded,model:validModel(model)?'learned':'rules'};
}
export function existingCatalogue(root) {
  const html=fs.readFileSync(path.join(root,'shop/index.html'),'utf8'),match=html.match(/let ALL = (\[.*?\]);\n/s);
  if(!match)throw Error('Embedded catalogue could not be read; refusing to skip deduplication');
  return [...JSON.parse(match[1]),...read(path.join(root,'products.json'))];
}
export function snapshots(snapshotDir) {
  const all=[],sources=[];
  for(const key of Object.keys(SOURCES)) {
    const p=path.join(snapshotDir,key+'.json');if(!fs.existsSync(p))continue;
    const s=read(p);if(s.products.length||!s.errors?.length)all.push(...normalize(s));sources.push({source:key,products:s.products.length,complete:s.complete,errors:s.errors});
  }
  if(!sources.length)throw Error('No supplier snapshots found');
  return {all,sources};
}
// Standing style/photo/price rules apply. Never pre-approve or filter by model score/count.
export function scanCandidates(candidates, existing=[], photos={}, params) {
  if(!params||!['rate','perKg','handling','minProfit','profitPct'].every(k=>Number.isFinite(params[k])&&params[k]>=0))throw Error('Actual pricing settings required');
  if(params.rate<=0)throw Error('Exchange rate must be positive');
  const refs=new Set(existing.map(i=>i.ref)), pages=new Set(existing.map(i=>urlKey(i.page)).filter(Boolean));
  const images=new Set(existing.flatMap(i=>[i.img,...(i.imgs||[])]).map(imageKey).filter(Boolean)),seen=new Set();
  const items=[];
  for(const c of candidates){
    const i=c.item;
    if(refs.has(i.ref)||pages.has(urlKey(i.page))||[i.img,...(i.imgs||[])].some(u=>images.has(imageKey(u)))||seen.has(i.ref))continue;
    seen.add(i.ref);
    if(!minimalCheck(i,c.evidence?.title).ok)continue;
    const estimate=G.estimate(i.tl,i.kg,params);
    if(!estimate||estimate.price>100000)continue;
    const photo=photos[c.id],people=new Set(photo?.people_photos||[]),clean=(i.imgs||[i.img]).filter(u=>!people.has(u));
    if(photo?.verdict==='leave_out'||!clean.length)continue;
    const best=clean.includes(photo?.best_photo)?photo.best_photo:clean[0]||"";
    if(!best)continue;
    items.push({...i,grp:c.product_key||i.grp||i.ref,source:"sourcing scan",img:best,imgs:clean});
  }
  return items;
}
export function pool(snapshotDir,outPath) {
  const {all}=snapshots(snapshotDir);
  const items=scanCandidates(all,existingCatalogue(ROOT),{},read(path.join(ROOT,'prices.json')).params);
  const refs=new Set(items.map(i=>i.ref));
  fs.writeFileSync(outPath,JSON.stringify({candidates:all.filter(c=>refs.has(c.item.ref)).map(c=>({id:c.id,item:c.item}))}));
  console.log(`pool: ${items.length} new candidates for photo checks; no preference cap`);
}
function cli(args) {
  const [command,...rest]=args;
  if(command==='build') throw Error('Standalone review retired. Use tools/sourcing/queue.mjs; review everything in the book.');
  else if(command==='pool') {if(rest.length<2)throw Error('pool SNAPSHOT_DIR OUTPUT_JSON');pool(rest[0],rest[1]);}
  else if(command==='train') {if(rest.length<2)throw Error('train OUTPUT_MODEL FEEDBACK_JSON...');const [output,...files]=rest;const rows=files.flatMap(p=>read(p).decisions||[]);const model=train(rows);fs.writeFileSync(output,JSON.stringify(model,null,2));console.log(JSON.stringify(model,null,2));}
  else console.log('Sourcing scan: node tools/sourcing/queue.mjs SNAPSHOT_DIR [PHOTO_SCORES_JSON]. Review in the book. Training: engine.mjs train OUTPUT_MODEL FEEDBACK_JSON...');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{cli(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}}
