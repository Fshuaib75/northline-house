#!/usr/bin/env python3
"""Reviews, recommendations and feedback for the SHOP page (14 Oct 2026).
  python3 tools/reviews-patch.py shop/index.html
Adds: per-product reviews (read from /reviews.json) with a "Write a review" form that sends the review to our WhatsApp,
a "You may also like" strip in the product sheet, star ratings on cards that have reviews, and a customer feedback section
above the footer. Nothing is shown unless it is in reviews.json (approved by us). Re-run after every build and after the
other patch scripts. Idempotent."""
import sys
MARK = "/*nl-reviews*/"

CSS = """
/*nl-reviews*/
.stars{color:#5E5E45;letter-spacing:1px;font-size:13px;white-space:nowrap}
.stars i{font-style:normal;color:var(--line-2)}.stars i.on{color:#5E5E45}
.info .rv{font-size:12px;color:var(--muted);display:flex;gap:6px;align-items:center}
.sec2{border-top:1px solid var(--line);padding-top:18px;display:grid;gap:12px}
.sec2 h3{font:500 20px/1.2 var(--display);margin:0;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
.sec2 h3 small{font:500 13px var(--ui);color:var(--muted)}
.rvl{display:grid;gap:14px;margin:0;padding:0;list-style:none}
.rvl li{display:grid;gap:4px;font-size:14px;color:var(--ink-2)}
.rvl p{margin:0}.rvl .who{font-size:12.5px;color:var(--muted)}
.rvnone{margin:0;font-size:14px;color:var(--ink-2)}
.rvform{display:grid;gap:10px;padding:14px;border:1px solid var(--line);border-radius:4px;background:var(--surface)}
.rvform[hidden]{display:none}
.rvform .row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.rvform textarea{min-height:92px;resize:vertical}
.rvform .note{font-size:12px;color:var(--muted);margin:0}
.rstar{display:flex;gap:2px}
.rstar button{font-size:28px;line-height:1;padding:4px 6px;color:var(--line-2);min-width:44px;min-height:44px}
.rstar button.on{color:#5E5E45}
.rvgo{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:var(--wa);color:#fff;font:600 14px var(--ui);padding:13px 18px;border-radius:2px;min-height:48px;text-decoration:none}
.rvgo[aria-disabled=true]{opacity:.45;pointer-events:none}
.recs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
@media (min-width:900px){.recs{grid-template-columns:repeat(4,minmax(0,1fr))}}
.rec{text-align:left;display:grid;gap:6px;align-content:start;cursor:pointer}
.rec .ph{aspect-ratio:4/5;background:var(--photo);overflow:hidden;border-radius:2px}
.rec .ph img{width:100%;height:100%;object-fit:cover;display:block}
.rec .m{font:500 14.5px/1.2 var(--display)}.rec .p{font:600 13.5px var(--ui)}.rec .b{font:600 10px var(--ui);letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
#fbSec{border-top:1px solid var(--line);margin-top:32px;padding-block:36px;display:grid;gap:22px}
#fbSec h2{font:500 28px/1.15 var(--display);margin:0}
#fbSec .lead{margin:0;color:var(--ink-2);max-width:56ch}
.fbgrid{display:grid;gap:26px}
@media (min-width:860px){.fbgrid{grid-template-columns:1.1fr .9fr;align-items:start}}
.yn{display:flex;gap:8px;flex-wrap:wrap}
.yn button{border:1px solid var(--line-2);border-radius:999px;padding:9px 16px;font:500 14px var(--ui);min-height:44px;background:transparent}
.yn button.on{background:var(--ink);color:var(--bg);border-color:var(--ink)}
"""

HTML_REV = '''      <section class="sec2" id="pdRev" aria-labelledby="pdRevH"><h3 id="pdRevH">Reviews <small id="pdRevSum"></small></h3>
        <ul class="rvl" id="pdRevList"></ul><p class="rvnone" id="pdRevNone" hidden>No reviews yet. Bought this? Tell us how it fits and how it looks. We reply, and we only post real reviews.</p>
        <div><button class="secondary" id="rvOpen" type="button">Write a review</button></div>
        <div class="rvform" id="rvForm" hidden>
          <div class="rstar" id="rvStars" role="group" aria-label="Your rating"></div>
          <textarea id="rvText" placeholder="How was the fit, quality and delivery?" aria-label="Your review"></textarea>
          <div class="row2"><input id="rvName" placeholder="First name" aria-label="First name" autocomplete="given-name"><input id="rvCity" placeholder="City" aria-label="City" autocomplete="address-level2"></div>
          <input id="rvSize" placeholder="Size you bought (optional)" aria-label="Size you bought">
          <a class="rvgo" id="rvGo" target="_blank" rel="noopener" aria-disabled="true">Send review on WhatsApp</a>
          <p class="note">It opens WhatsApp with your review written. Press send. We show it with your first name and city once we have checked it against your order.</p>
        </div>
      </section>
'''
HTML_REC = '''      <section class="sec2" id="pdRecS" aria-labelledby="pdRecH" hidden><h3 id="pdRecH">You may also like</h3><div class="recs" id="pdRec"></div></section>
'''
HTML_FB = '''<section class="wrap" id="fbSec" aria-labelledby="fbH">
  <div><h2 id="fbH">What customers say</h2><p class="lead" id="fbLead">Real words from people who ordered. Nothing here is written by us.</p></div>
  <div class="fbgrid">
    <div><ul class="rvl" id="fbList"></ul><p class="rvnone" id="fbNone" hidden>Our first customer messages will appear here once they are checked. Ordered from us? Send yours, it helps the next person decide.</p></div>
    <div class="rvform" id="fbForm">
      <b style="font:500 18px var(--display)">How are we doing?</b>
      <div class="rstar" id="fbStars" role="group" aria-label="Your rating"></div>
      <div class="yn" id="fbYn" role="group" aria-label="Would you recommend Northline?"><button type="button" data-v="Yes, I would recommend Northline">I would recommend you</button><button type="button" data-v="Not yet">Not yet</button></div>
      <textarea id="fbText" placeholder="What went well? What should we fix?" aria-label="Your feedback"></textarea>
      <div class="row2"><input id="fbName" placeholder="First name" aria-label="First name"><input id="fbCity" placeholder="City" aria-label="City"></div>
      <a class="rvgo" id="fbGo" target="_blank" rel="noopener" aria-disabled="true">Send feedback on WhatsApp</a>
      <p class="note">Opens WhatsApp with your message written. Press send.</p>
    </div>
  </div>
</section>
'''

JS = r'''
/*nl-reviews-js*/
let REV={reviews:[],feedback:[]};
function normRev(j){ const ok=x=>x&&typeof x.text==="string"&&x.text.trim()&&x.rating>=1&&x.rating<=5;
  return {reviews:((j&&j.reviews)||[]).filter(r=>ok(r)&&r.ref), feedback:((j&&j.feedback)||[]).filter(ok)}; }
const starsHtml=n=>`<span class="stars" aria-label="${n} out of 5">${[1,2,3,4,5].map(k=>`<i class="${k<=Math.round(n)?"on":""}">★</i>`).join("")}</span>`;
function revFor(g){ const refs=new Set(g.items.map(x=>x.ref)); return REV.reviews.filter(r=>refs.has(r.ref)); }
const avg=l=>l.reduce((a,r)=>a+r.rating,0)/l.length;
function revCard(g){ const l=revFor(g); return l.length?`<span class="rv">${starsHtml(avg(l))}<span>${avg(l).toFixed(1)} (${l.length})</span></span>`:""; }
function revItem(r){ return `<li>${starsHtml(r.rating)}<p>${esc(r.text)}</p><span class="who">${esc([r.name,r.city].filter(Boolean).join(", "))}${r.size?" · size "+esc(r.size):""}${r.verified?" · bought from us":""}</span></li>`; }
function starPicker(el, cb){ el.innerHTML=[1,2,3,4,5].map(k=>`<button type="button" data-k="${k}" aria-label="${k} star${k>1?"s":""}">★</button>`).join("");
  el.onclick=e=>{ const b=e.target.closest("button"); if(!b) return; const k=+b.dataset.k; el.dataset.v=k; [...el.children].forEach((c,j)=>c.classList.toggle("on",j<k)); cb(); }; }
const waLink=t=>"https://wa.me/"+WA+"?text="+encodeURIComponent(t);
function drawRev(){ const g=BYREF.get(PD.i.ref); if(!g) return; const l=revFor(g), i=PD.i;
  $("pdRevSum").textContent=l.length?avg(l).toFixed(1)+" out of 5 · "+l.length+(l.length>1?" reviews":" review"):"";
  $("pdRevList").innerHTML=l.slice(0,6).map(revItem).join(""); $("pdRevNone").hidden=!!l.length;
  $("rvForm").hidden=true; $("rvStars").dataset.v=""; [...$("rvStars").children].forEach(c=>c.classList.remove("on")); $("rvText").value="";
  rvUpd(); drawRec(g); }
function rvUpd(){ const i=PD.i, k=+$("rvStars").dataset.v||0, t=$("rvText").value.trim(), ok=k&&t.length>=10;
  $("rvGo").setAttribute("aria-disabled",ok?"false":"true");
  $("rvGo").href=ok?waLink(`Review for ${i.brand} ${i.model}${i.colour?" ("+i.colour+")":""}, ref ${i.ref}\nRating: ${k}/5\n"${t}"\n${$("rvSize").value.trim()?"Size: "+$("rvSize").value.trim()+"\n":""}From: ${[$("rvName").value.trim(),$("rvCity").value.trim()].filter(Boolean).join(", ")||"(name)"}\nYou may show this on the site: yes`):"#"; }
function drawRec(g){ const i=g.items[0], sec=secOf(i);
  const sc=h=>{ const x=h.items[0]; if(h===g||h.items.every(soldOut)||secOf(x)!==sec) return -1; let s=1;
    if(x.for&&x.for===i.for) s+=3; else if(x.for&&i.for&&x.for!==i.for) s-=2; if(x.kind&&x.kind===i.kind) s+=2; if(x.brand===i.brand) s+=1;
    s+=Math.max(0,2-Math.abs(x.price-i.price)/Math.max(i.price,1)*4); return s; };
  const top=GROUPS.map(h=>[sc(h),h]).filter(a=>a[0]>0).sort((a,b)=>b[0]-a[0]||(a[1].items[0].ref<b[1].items[0].ref?-1:1)).slice(0,4).map(a=>a[1]);
  $("pdRecS").hidden=!top.length;
  $("pdRec").innerHTML=top.map(h=>{ const x=h.items.find(y=>!soldOut(y))||h.items[0], im=imgTag(photoChain(x.img,x.imgs||[],x.full),`alt="${esc(x.model)}" loading="lazy"`,"card");
    return `<button class="rec" type="button" data-ref="${esc(x.ref)}"><div class="ph">${im}</div><span class="b">${esc(x.brand)}</span><span class="m">${esc(x.model)}</span><span class="p">${N(x.price)}</span></button>`; }).join(""); }
$("pdRec").addEventListener("click",e=>{ const b=e.target.closest(".rec"); if(!b) return; const g=BYREF.get(b.dataset.ref); if(!g) return; const x=g.items.find(y=>y.ref===b.dataset.ref)||g.items[0];
  PD.items=g.items; PD.i=x; PD.size=null; PD.qty=1; drawPD(true); $("pd").querySelector(".pdin").scrollTop=0;
  try{ history.replaceState(history.state,"",urlFor({i:x.ref})); }catch(_){} track("rec/"+x.ref, x.brand+" "+x.model); });
starPicker($("rvStars"),rvUpd); ["rvText","rvName","rvCity","rvSize"].forEach(id=>$(id).addEventListener("input",rvUpd));
$("rvOpen").onclick=()=>{ $("rvForm").hidden=!$("rvForm").hidden; if(!$("rvForm").hidden) $("rvText").focus(); };
$("rvGo").addEventListener("click",()=>track("review/send/"+PD.i.ref, PD.i.brand+" "+PD.i.model));
// feedback section
function drawFb(){ $("fbList").innerHTML=REV.feedback.slice(0,6).map(revItem).join(""); $("fbNone").hidden=!!REV.feedback.length; }
function fbUpd(){ const k=+$("fbStars").dataset.v||0, t=$("fbText").value.trim(), yn=($("fbYn").querySelector(".on")||{}).dataset, ok=(k||yn)&&(t.length>=5||yn);
  $("fbGo").setAttribute("aria-disabled",ok?"false":"true");
  $("fbGo").href=ok?waLink(`Feedback for Northline\n${k?"Rating: "+k+"/5\n":""}${yn?yn.v+"\n":""}${t?'"'+t+'"\n':""}From: ${[$("fbName").value.trim(),$("fbCity").value.trim()].filter(Boolean).join(", ")||"(name)"}`):"#"; }
starPicker($("fbStars"),fbUpd); ["fbText","fbName","fbCity"].forEach(id=>$(id).addEventListener("input",fbUpd));
$("fbYn").addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b) return; [...$("fbYn").children].forEach(c=>c.classList.toggle("on",c===b&&!c.classList.contains("on"))); fbUpd(); });
$("fbGo").addEventListener("click",()=>track("feedback/send","Feedback"));
drawFb();
'''

def patch(path):
    s = open(path, encoding="utf-8").read()
    if MARK in s: print(path, "already patched"); return
    def rep(a, b, must=True):
        nonlocal s
        if s.count(a) != 1:
            if must: sys.exit(f"anchor not unique/found ({s.count(a)}): {a[:70]}")
            return
        s = s.replace(a, b)
    rep("</style>", CSS + "</style>")
    rep('      <ul class="facts">', HTML_REV + '      <ul class="facts">') if False else None
    rep('      <a class="secondary" id="pdAsk"', HTML_REV + '      <a class="secondary" id="pdAsk"')
    rep('      <div class="ref" id="pdRef"></div>', HTML_REC + '      <div class="ref" id="pdRef"></div>')
    rep('<footer class="foot">', HTML_FB + '\n<footer class="foot">')
    rep('<span class="p">${N(i.price)}</span>${fewSizes(i)', '<span class="p">${N(i.price)}</span>${revCard(c.g)}${fewSizes(i)')
    rep('  $("pdRef").textContent=`Ref ${i.ref}`;', '  $("pdRef").textContent=`Ref ${i.ref}`; drawRev();')
    rep('fresh("brands.json")]).then(([added,j,drop,cap,brs])=>{', 'fresh("brands.json"), fresh("reviews.json")]).then(([added,j,drop,cap,brs,rev])=>{ REV=normRev(rev); drawFb();')
    rep('// ---------- numbered pages, and the whole view in the link ----------', '// ---------- numbered pages, and the whole view in the link ----------')
    # JS goes right before the data-loading block so every helper exists; function bodies run later
    rep('// ---------- product sheet ----------', JS + '\n// ---------- product sheet ----------')
    s = s.replace("<script>\nlet ALL", "<script>" + MARK + "\nlet ALL", 1)
    open(path, "w", encoding="utf-8").write(s); print(path, "patched")
for p in sys.argv[1:]: patch(p)
