(function(root){
  'use strict';
  const loud=i=>/\b(croc\w*|snake|python|leopard|zebra|animal)\b/i.test([i.brand,i.model,i.colour,i.desc].join(' '));
  const style=i=>i.grp||[i.brand,i.model,i.g,i.kind].join('|');
  // Reviewed original supplier frames: the messenger's old lead and interior are detail shots.
  const detailPhotos=new Set(['IMG-3576763679003673206.jpg','IMG-8372290966406132383.jpg']);
  const fullLeads={'USPA-BAG-9508-MS':'IMG-5914703428641554540.jpg'};
  const photoKey=u=>String(u||'').split('?')[0].split('/').pop();
  function cardLead(i,allowed=()=>true){
    const urls=[i.img,...(i.imgs||[]),i.full].filter(Boolean);
    const safe=u=>allowed(u)&&!detailPhotos.has(photoKey(u))&&!/detail|close.?up|zoom|size.chart/i.test(u);
    const reviewed=fullLeads[i.ref]&&urls.find(u=>photoKey(u)===fullLeads[i.ref]&&safe(u));
    return reviewed||(i.img&&safe(i.img)?i.img:'');
  }
  function eligible(pool,items,checks){
    const accepted=[],rejected=[],seen=new Set();
    for(const ref of [...new Set(Array.isArray(pool?.refs)?pool.refs:[])].slice(0,30)){
      const i=items.find(i=>i.ref===ref); let reason='';
      if(!i) reason='not live or hidden';
      else if(checks.soldOut(i)) reason='sold out';
      else if(!checks.calm(i)) reason='no calm approved colour';
      else if(loud(i)||checks.loud(i)) reason='loud details';
      else if(!(Number.isFinite(i.price)&&i.price>=18000)) reason='below N18k';
      const photo=!reason&&checks.photo(i);
      if(!reason&&!photo) reason='no full-product photo';
      if(!reason&&seen.has(style(i))) reason='duplicate style';
      if(reason) rejected.push({ref,reason});
      else {seen.add(style(i));accepted.push({...i,heroPhoto:photo,heroCategory:checks.category(i)});}
    }
    return {accepted,rejected};
  }
  function select(items,previous=[],random=Math.random){
    if(items.length<3) return [];
    const shuffled=items.map(i=>({i,r:random()})).sort((a,b)=>a.r-b.r).map(x=>x.i);
    // Enumerate triples so previous-visit avoidance cannot destroy category coverage.
    let best=null,bestCost=Infinity;
    const categories=['M','W','A'],cover=categories.every(c=>items.some(i=>i.heroCategory===c));
    for(let a=0;a<shuffled.length;a++)for(let b=a+1;b<shuffled.length;b++)for(let c=b+1;c<shuffled.length;c++){
      const triple=[shuffled[a],shuffled[b],shuffled[c]];
      if(new Set(triple.map(style)).size<3) continue;
      if(cover?!categories.every(k=>triple.some(i=>i.heroCategory===k)):new Set(triple.map(i=>i.brand)).size<3) continue;
      const cost=triple.filter(i=>previous.includes(i.ref)).length;
      if(cost<bestCost){best=triple;bestCost=cost;}
    }
    return (best||[]).sort((a,b)=>(categories.indexOf(a.heroCategory)<0?3:categories.indexOf(a.heroCategory))-(categories.indexOf(b.heroCategory)<0?3:categories.indexOf(b.heroCategory)));
  }
  // Read-only canvas inspection. The displayed supplier image is never changed.
  function inspectPixels(data,w,h){
    const corners=[[1,1],[w-2,1],[1,h-2],[w-2,h-2]].map(([x,y])=>Array.from(data.slice((y*w+x)*4,(y*w+x)*4+3)));
    const colour=[0,1,2].map(c=>Math.round(corners.map(p=>p[c]).sort((a,b)=>a-b).slice(1,3).reduce((a,b)=>a+b)/2));
    if(corners.some(p=>p.some((v,c)=>Math.abs(v-colour[c])>25))) return null;
    let minX=w,minY=h,maxX=-1,maxY=-1;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const n=(y*w+x)*4;if(data[n+3]<240)continue;if(Math.max(...colour.map((v,c)=>Math.abs(data[n+c]-v)))>48){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}
    return {colour: 'rgb('+colour.join(', ')+')',full:maxX>=0&&minX>0&&minY>0&&maxX<w-1&&maxY<h-1};
  }
  function samplePhoto(url){return new Promise(resolve=>{
    const image=new Image();let done=false;const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve(value);};
    const timer=setTimeout(()=>finish(null),8000);image.crossOrigin='anonymous';
    image.onerror=()=>finish(null);image.onload=()=>{try{const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,96,96);finish(inspectPixels(ctx.getImageData(0,0,96,96).data,96,96));}catch{finish(null);}};
    image.src='https://wsrv.nl/?url='+encodeURIComponent(url)+'&w=96&output=jpg';
  });}
  async function start(pool,items,checks){
    const hero=document.querySelector('.hero-carousel'); if(!hero) return;
    const slides=[...hero.querySelectorAll('[data-hero-slide]')],dots=[...hero.querySelectorAll('[data-hero-index]')];
    let previous=[];try{const p=JSON.parse(localStorage.getItem('nl-hero-previous')||'[]');if(Array.isArray(p))previous=p;}catch{}
    const audit=eligible(pool,items,checks),used=new Set(); let candidates=audit.accepted,active=[],retired=false;
    hero.heroAudit=audit;
    const load=i=>new Promise(resolve=>{const img=new Image();let done=false;const finish=ok=>{if(done)return;done=true;clearTimeout(timer);resolve(ok);};const timer=setTimeout(()=>finish(false),18000);img.referrerPolicy='no-referrer';img.onload=async()=>{const sample=await samplePhoto(i.heroPhoto);if(sample&&!sample.full){audit.rejected.push({ref:i.ref,reason:'no full-product photo'});finish(false);return;}i.heroBackground=sample?.colour||'';finish(img.naturalWidth>0);};img.onerror=()=>finish(false);img.src=i.heroPhoto;});
    const remember=()=>{hero.dataset.poolRefs=active.map(i=>i.ref).join(',');try{localStorage.setItem('nl-hero-previous',JSON.stringify(active.map(i=>i.ref)));}catch{}};
    function fallback(){retired=true;slides.forEach((s,n)=>{s.querySelector('.hero-pool-content')?.remove();s.classList.remove('hero-product');s.setAttribute('aria-label',s.dataset.fixedLabel);dots[n].setAttribute('aria-label',dots[n].dataset.fixedLabel);[...s.children].forEach(e=>e.removeAttribute('aria-hidden'));});active=[];delete hero.dataset.poolRefs;}
    function paint(i,n){
      const slide=slides[n];slide.querySelector('.hero-pool-content')?.remove();
      [...slide.children].forEach(e=>e.setAttribute('aria-hidden','true'));slide.classList.add('hero-product');
      const box=document.createElement('div');box.className='hero-pool-content';
      const copy=document.createElement('div');copy.className='hero-copy';
      const kicker=document.createElement('p');kicker.className='kicker';kicker.textContent='NORTHLINE HOUSE';
      const heading=document.createElement(n?'h2':'h1');heading.textContent=i.brand+' '+i.model;
      const price=document.createElement('p');price.className='hero-description';price.textContent='₦'+Number(i.price).toLocaleString('en-NG');
      const link=document.createElement('a');link.className='hero-cta';link.textContent='Shop this style';const url=new URL(location.href);url.search='';url.hash='browse';url.searchParams.set('i',i.ref);const agent=checks.agent();if(agent)url.searchParams.set('a',agent);link.href=url.pathname+url.search+url.hash;
      const actions=document.createElement('div');actions.className='hero-actions';const how=document.createElement('a');how.className='text-link';how.href='#how-it-works';how.textContent='How to order';actions.append(link,how);copy.append(kicker,heading,price,actions);const img=document.createElement('img');img.alt=[i.brand,i.model,i.colour].filter(Boolean).join(' · ');img.referrerPolicy='no-referrer';img.setAttribute('fetchpriority',n?'auto':'high');img.src=i.heroPhoto;
      img.onerror=async()=>{img.onerror=null;for(const next of candidates.filter(x=>x.heroCategory===i.heroCategory&&!used.has(x.ref)&&!active.some(a=>style(a)===style(x))).sort((a,b)=>Number(b.heroCategory===i.heroCategory)-Number(a.heroCategory===i.heroCategory))){if(retired)return;used.add(next.ref);const ok=await load(next);if(retired)return;if(ok){active[n]=next;paint(next,n);remember();return;}}fallback();};
      const visual=document.createElement('div');visual.className='hero-visual';const label=document.createElement('span');label.className='visual-label';label.textContent=i.heroCategory==='M'?"MEN’S SHOES":i.heroCategory==='W'?"WOMEN’S SHOES":'BAGS & ACCESSORIES';if(i.heroBackground){visual.style.backgroundColor=i.heroBackground;img.style.mixBlendMode='normal';visual.dataset.backgroundMatched='true';}visual.append(img,label);box.append(copy,visual);slide.append(box);slide.setAttribute('aria-label',`${n+1} of 3: ${heading.textContent}`);dots[n].setAttribute('aria-label',`Show ${heading.textContent}`);
    }
    while(candidates.length>=3){
      const picks=select(candidates,previous);if(picks.length<3)return;
      const ok=await Promise.all(picks.map(load));const failed=picks.filter((i,n)=>!ok[n]);
      if(failed.length){failed.forEach(i=>{if(!audit.rejected.some(r=>r.ref===i.ref))audit.rejected.push({ref:i.ref,reason:'photo failed to load'});});candidates=candidates.filter(i=>!failed.includes(i));continue;}
      active=picks;slides.forEach((s,n)=>{s.dataset.fixedLabel=s.getAttribute('aria-label');dots[n].dataset.fixedLabel=dots[n].getAttribute('aria-label');});
      picks.forEach((i,n)=>{used.add(i.ref);paint(i,n);});remember();hero.dataset.poolRefs=picks.map(i=>i.ref).join(',');hero.dispatchEvent(new Event('hero-pool-ready'));return;
    }
  }
  const api={eligible,select,start,loud,inspectPixels,cardLead};if(typeof module==='object')module.exports=api;else root.NLHero=api;
})(typeof window==='object'?window:globalThis);
