import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import Hero from '../shop/hero-pool.js';
const origin='https://northlinehouse.shop';
export const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function prepare(items,prices,stock,blocked=[],now=new Date()){
 if(!prices?.prices||typeof prices.prices!=='object')throw Error('Authoritative prices required');
 const hidden=new Set(prices.hidden||[]),deny=new Set(blocked),seen=new Set();
 const lagosDay=new Date(now.getTime()+3600000).toISOString().slice(0,10);
 const map=prices.switchAt&&lagosDay>=prices.switchAt?{...prices.prices,...prices.next}:prices.prices;
 return items.flatMap(i=>{
  if(!i?.ref||! /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(i.ref)||hidden.has(i.ref)||seen.has(i.ref.toLowerCase()))return [];
  const price=map[i.ref]?.[0];if(!Number.isFinite(price)||price<=0)return [];
  seen.add(i.ref.toLowerCase());
  const photo=Hero.cardLead(i,u=>/^https:\/\//.test(u)&&!deny.has(u.split('?')[0].split('/').pop()));
  if(!photo)return [];
  const record=stock[i.ref],stamp=Date.parse(record?.checked_at),age=now.getTime()-stamp;
  const verified=Number.isFinite(stamp)&&age>=0&&age<14*864e5&&!record.stale;
  const availability=verified?(record.on&&record.stock?.length?'InStock':'OutOfStock'):null;
  return [{...i,price,photo,availability,url:origin+'/shop/products/'+encodeURIComponent(i.ref)+'/'}];
 });
}
export function render(i,updated){
 const title=[i.brand,i.model,i.colour].filter(Boolean).join(' · '),price=new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(i.price);
 const schema={'@context':'https://schema.org','@type':'Product',name:title,sku:i.ref,image:[i.photo],brand:{'@type':'Brand',name:i.brand},url:i.url,description:i.desc||title};
 // Unknown/stale stock never becomes an InStock claim or an invented rating.
 if(i.availability)schema.offers={'@type':'Offer',url:i.url,priceCurrency:'NGN',price:i.price,availability:'https://schema.org/'+i.availability};
 const shop=origin+'/shop/?i='+encodeURIComponent(i.ref);
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} | Northline House</title><meta name="description" content="${escape(title+'. '+price+'. Check current sizes and order from Northline House, delivered across Nigeria.')}"><link rel="canonical" href="${escape(i.url)}"><meta property="og:title" content="${escape(title)}"><meta property="og:type" content="product"><meta property="og:url" content="${escape(i.url)}"><meta property="og:image" content="${escape(i.photo)}"><meta name="twitter:card" content="summary_large_image"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g,'\\u003c')}</script><style> *{box-sizing:border-box}body{margin:0;background:#fbf8f2;color:#2e2c29;font:16px/1.6 system-ui,sans-serif}header,main,footer{max-width:1100px;margin:auto;padding:24px}header{border-bottom:1px solid #e2d9ca}header img{width:180px}main{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;padding-block:48px}.photo{width:100%;height:480px;object-fit:contain;background:transparent;mix-blend-mode:multiply}h1{font:400 40px/1.15 Georgia,serif;margin:12px 0}a{color:inherit}.cta{display:inline-block;background:#2e2c29;color:#fbf8f2;padding:14px 22px;text-decoration:none;margin:20px 0}.price{font-size:24px}.note{color:#6b6257;font-size:14px}footer{border-top:1px solid #e2d9ca}a:focus-visible{outline:2px solid #5e5e45;outline-offset:4px}@media(max-width:700px){main{grid-template-columns:1fr;gap:24px;padding-block:24px}.photo{height:330px}h1{font-size:32px}}</style></head><body><header><a href="/shop/" aria-label="Northline House shop"><img src="/brand/northline-wordmark-ink.svg" alt="Northline House" width="180" height="36"></a></header><main><img class="photo" src="${escape(i.photo)}" alt="${escape(title)}" width="600" height="600" fetchpriority="high"><section><nav aria-label="Breadcrumb"><a href="/shop/">Shop</a> / ${escape(i.brand)}</nav><h1>${escape(i.model)}</h1><p>${escape(i.brand)} · ${escape(i.colour)}</p><p>${escape(i.desc||'')}</p><p class="price">${escape(price)}</p><p>${i.availability==='OutOfStock'?'Sold out at the last check.':i.availability==='InStock'?'Sizes available at the last check.':'Confirm availability before ordering.'}</p><a class="cta" href="${escape(shop)}">Check sizes &amp; current price</a><p class="note">Catalogue snapshot: ${escape(updated)}. Confirm availability and delivery before payment. Allow up to 14 days after payment. Sizes cannot be exchanged.</p></section></main><footer><a href="/shop/#how-it-works">How to order</a> · Northline House</footer></body></html>`;
}
export function build(root,out,now=new Date()){
 if(fs.existsSync(out)&&fs.readdirSync(out).length)throw Error('Output must be empty to avoid retaining removed products');
 const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8').replace(/^\uFEFF/,''));
 const source=fs.readFileSync(path.join(root,'shop/index.html'),'utf8');
 const match=source.match(/let ALL = (\[.*?\]);\r?\n/s);if(!match)throw Error('Catalogue source not found');
 const catalogue=new Map(JSON.parse(match[1]).map(i=>[i.ref,i]));for(const i of read('products.json'))if(i?.ref&&!catalogue.has(i.ref))catalogue.set(i.ref,i);
 const stock={};for(const file of ['capone.json','brands.json']){const data=read(file);for(const [ref,r] of Object.entries(data.styles||{})){stock[ref]={...r,checked_at:r.checked_at||(!r.stale?data.checked:null)};if(file==='capone.json'&&r.img?.length&&catalogue.has(ref)){const i=catalogue.get(ref);catalogue.set(ref,{...i,img:r.img[0],imgs:r.img});}}}
 const products=prepare([...catalogue.values()],read('prices.json'),stock,read('photo-rules.json').photos,now);
 fs.mkdirSync(out,{recursive:true});const date=now.toISOString().slice(0,10);
 for(const i of products){const dir=path.join(out,'shop/products',i.ref);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'index.html'),render(i,date));}
 fs.writeFileSync(path.join(out,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+[origin+'/shop/',...products.map(i=>i.url)].map(url=>'<url><loc>'+escape(url)+'</loc></url>').join('')+'</urlset>');
 const report={built:date,products:products.length,verifiedOffers:products.filter(i=>i.availability).length,unverified:products.filter(i=>!i.availability).length};fs.writeFileSync(path.join(out,'build-report.json'),JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){if(!process.argv[2]||!process.argv[3])throw Error('Usage: node tools/product-pages.mjs SOURCE EMPTY_OUTPUT');console.log(build(path.resolve(process.argv[2]),path.resolve(process.argv[3])));}
