(function(root){
  'use strict';
  const style=i=>i.grp||[i.brand,i.model,i.g,i.kind].join('|');
  function eligible(pool,items,checks){
    const accepted=[],rejected=[],seen=new Set();
    for(const ref of [...new Set(Array.isArray(pool?.refs)?pool.refs:[])].slice(0,30)){
      const i=items.find(i=>i.ref===ref); let reason='';
      if(!i) reason='not live or hidden';
      else if(checks.soldOut(i)) reason='sold out';
      else if(!checks.calm(i)) reason='no calm approved colour';
      else if(checks.loud(i)) reason='loud details';
      else if(!(i.price>=18000&&i.price<=60000)) reason='outside N18–60k';
      const photo=!reason&&checks.photo(i);
      if(!reason&&!photo) reason='no product photo passes photo rules';
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
    return best||[];
  }
  async function start(pool,items,checks){
    const hero=document.querySelector('.hero-carousel'); if(!hero) return;
    const slides=[...hero.querySelectorAll('[data-hero-slide]')],dots=[...hero.querySelectorAll('[data-hero-index]')];
    let previous=[];try{const p=JSON.parse(localStorage.getItem('nl-hero-previous')||'[]');if(Array.isArray(p))previous=p;}catch{}
    const audit=eligible(pool,items,checks),used=new Set(); let candidates=audit.accepted,active=[],retired=false;
    hero.heroAudit=audit;
    const load=i=>new Promise(resolve=>{const img=new Image();let done=false;const finish=ok=>{if(done)return;done=true;clearTimeout(timer);resolve(ok);};const timer=setTimeout(()=>finish(false),8000);img.referrerPolicy='no-referrer';img.onload=()=>finish(img.naturalWidth>0);img.onerror=()=>finish(false);img.src=i.heroPhoto;});
    const remember=()=>{hero.dataset.poolRefs=active.map(i=>i.ref).join(',');try{localStorage.setItem('nl-hero-previous',JSON.stringify(active.map(i=>i.ref)));}catch{}};
    function fallback(){retired=true;slides.forEach((s,n)=>{s.querySelector('.hero-pool-content')?.remove();s.classList.remove('hero-product');s.setAttribute('aria-label',s.dataset.fixedLabel);dots[n].setAttribute('aria-label',dots[n].dataset.fixedLabel);[...s.children].forEach(e=>e.removeAttribute('aria-hidden'));});active=[];delete hero.dataset.poolRefs;}
    function paint(i,n){
      const slide=slides[n];slide.querySelector('.hero-pool-content')?.remove();
      [...slide.children].forEach(e=>e.setAttribute('aria-hidden','true'));slide.classList.add('hero-product');
      const box=document.createElement('div');box.className='hero-pool-content';
      const copy=document.createElement('div');copy.className='hero-pool-copy';
      const heading=document.createElement(n?'h2':'h1');heading.textContent=i.brand+' '+i.model;
      const price=document.createElement('p');price.textContent='₦'+Number(i.price).toLocaleString('en-NG');
      const link=document.createElement('a');link.className='hero-cta';link.textContent='Shop this style';const url=new URL(location.href);url.search='';url.hash='browse';url.searchParams.set('i',i.ref);const agent=checks.agent();if(agent)url.searchParams.set('a',agent);link.href=url.pathname+url.search+url.hash;
      copy.append(heading,price,link);const img=document.createElement('img');img.alt=[i.brand,i.model,i.colour].filter(Boolean).join(' · ');img.referrerPolicy='no-referrer';img.setAttribute('fetchpriority',n?'auto':'high');img.src=i.heroPhoto;
      img.onerror=async()=>{img.onerror=null;for(const next of candidates.filter(x=>!used.has(x.ref)&&!active.some(a=>style(a)===style(x))).sort((a,b)=>Number(b.heroCategory===i.heroCategory)-Number(a.heroCategory===i.heroCategory))){if(retired)return;used.add(next.ref);const ok=await load(next);if(retired)return;if(ok){active[n]=next;paint(next,n);remember();return;}}fallback();};
      box.append(copy,img);slide.append(box);slide.setAttribute('aria-label',`${n+1} of 3: ${heading.textContent}`);dots[n].setAttribute('aria-label',`Show ${heading.textContent}`);
    }
    while(candidates.length>=3){
      const picks=select(candidates,previous);if(picks.length<3)return;
      const ok=await Promise.all(picks.map(load));const failed=picks.filter((i,n)=>!ok[n]);
      if(failed.length){failed.forEach(i=>audit.rejected.push({ref:i.ref,reason:'photo failed to load'}));candidates=candidates.filter(i=>!failed.includes(i));continue;}
      active=picks;slides.forEach((s,n)=>{s.dataset.fixedLabel=s.getAttribute('aria-label');dots[n].dataset.fixedLabel=dots[n].getAttribute('aria-label');});
      picks.forEach((i,n)=>{used.add(i.ref);paint(i,n);});remember();hero.dataset.poolRefs=picks.map(i=>i.ref).join(',');return;
    }
  }
  const api={eligible,select,start};if(typeof module==='object')module.exports=api;else root.NLHero=api;
})(typeof window==='object'?window:globalThis);
