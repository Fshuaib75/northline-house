#!/usr/bin/env python3
"""UI flow patch (15 Oct 2026): clearer ordering wording, tighter mobile hero, grouped filters, scannable commission block.
  python3 tools/ui-flow-patch.py shop shop/index.html
  python3 tools/ui-flow-patch.py agent index.html
Edits built pages by exact string replacement and appends one block of CSS. Repeat-safe (marker). Run it AFTER build, accessories,
polish and reviews patches. Changes wording and layout only: no prices, no commission formula or rule, no business logic."""
import sys
MARK = "/*nl-ui-flow-2026-10-15*/"
ORDER = "We confirm your size and delivery with you personally before you pay."

SHOP_EDITS = [
 # hero line
 ("<p>Shoes, bags and clothing from trusted brands. Order on WhatsApp and we check your size with you before you pay.</p>",
  f"<p>Shoes, bags and clothing from trusted brands. {ORDER}</p>"),
 # meta
 ("delivered across Nigeria. Order on WhatsApp.", "delivered across Nigeria. Order online and pay by bank transfer after we confirm."),
 # product sheet fact
 (", only after we confirm your order on WhatsApp.</span>", ", only after we confirm your order.</span>"),
 # footer ordering block
 ("<p>Payment by bank transfer, only after we confirm your order.</p><p>No size exchanges, so we check your size with you before you pay.</p>",
  f"<p>{ORDER}</p><p>Payment by bank transfer, only after we confirm. No size exchanges.</p>"),
 # order button + note
 ("Send my order on WhatsApp</a>", "Place order</a>"),
 ('<p class="hint">Opens WhatsApp with your order typed out: press send there. We reply to confirm your size and the total, then you pay by bank transfer. If WhatsApp doesn’t open,',
  f'<p class="hint">{ORDER} You pay by bank transfer after we confirm. Sizes can’t be exchanged. Your order opens in WhatsApp, ready to send. If it doesn’t,'),
 # filters: common first, the rest under "More filters"
 # size confidence: the personal check and the no-exchange rule, right under the size choices
 ('<p class="few" id="pdFew" hidden', '<p class="szn" id="pdSzn">Not sure of your size? Add your foot length or a note when you order and we check it with you before you pay. Sizes can’t be exchanged.</p><p class="few" id="pdFew" hidden'),
 ('function drawFilters(){', '''let MOREF=false;
const moreActive=()=>[...S.f].filter(x=>/^heel:/.test(x)).length;
function moreF(html){ if(!html) return ""; const n=moreActive();
  return `<details class="more"${MOREF||n?" open":""}><summary><span>More filters</span>${n?`<em>${n} on</em>`:`<small>Heel</small>`}</summary>${html}</details>`; }
$("fBody").addEventListener("toggle",e=>{ if(e.target.matches&&e.target.matches("details.more")) MOREF=e.target.open; },true);
function drawFilters(){'''),
 ('+ fOpts("fam",FAM_ORDER,"Colour") + fOpts("band",BANDS,"Price") + fOpts("heel",HEEL_ORDER,"Heel") + fOpts("brand",brands,"Brand");',
  '+ fOpts("brand",brands,"Brand") + fOpts("fam",FAM_ORDER,"Colour") + fOpts("band",BANDS,"Price") + moreF(fOpts("heel",HEEL_ORDER,"Heel"));'),
]

AGENT_EDITS = [
 ('<p id="commOld">Shoes and bags: ₦5,000 each, or ₦3,000 on items priced ₦30,000 and under. Baby clothes: ₦1,500 a piece. An item counts once the customer has paid. Your first sale is paid as soon as the customer pays. After that, when you reach 5 items, Northline pays you what those 5 earned and your count starts again from 0. Every item shows what you earn on it.</p>',
  '''<ul class="pts" id="commOld">
        <li><b>Per item</b><span>Shoes and bags: ₦5,000 each, or ₦3,000 on items priced ₦30,000 and under. Baby clothes: ₦1,500 a piece.</span></li>
        <li><b>What counts</b><span>An item counts once the customer has paid.</span></li>
        <li><b>First sale</b><span>Paid as soon as the customer pays.</span></li>
        <li><b>After that</b><span>When you reach 5 items, Northline pays you what those 5 earned and your count starts again from 0.</span></li>
        <li><b>Your amount</b><span>Every item shows what you earn on it.</span></li>
      </ul>'''),
 ('<p id="commNew" hidden>Every item shows what you earn on it: a quarter (25%) of Northline’s margin on that item, rounded up to the next ₦500 (most baby clothes ₦1,500). An item counts once the customer has paid. Your first sale is paid as soon as the customer pays. After that, when you reach 5 items, Northline pays you what those 5 earned and your count starts again from 0.</p>',
  '''<ul class="pts" id="commNew" hidden>
        <li><b>Per item</b><span>A quarter (25%) of Northline’s margin on that item, rounded up to the next ₦500 (most baby clothes ₦1,500).</span></li>
        <li><b>Your amount</b><span>Every item shows what you earn on it.</span></li>
        <li><b>What counts</b><span>An item counts once the customer has paid.</span></li>
        <li><b>First sale</b><span>Paid as soon as the customer pays.</span></li>
        <li><b>After that</b><span>When you reach 5 items, Northline pays you what those 5 earned and your count starts again from 0.</span></li>
      </ul>'''),
 ('<div class="notice" id="commNotice" hidden><b>New from <span class="swd"></span>:</b> your commission becomes a quarter (25%) of Northline’s margin on each item, rounded up to the next ₦500. Your first sale is still paid straight away, then every 5 items. Most prices go down at the same time, so items are easier to sell. Orders sent before <span class="swd"></span> earn today’s rate. Every item will keep showing what you earn.</div>',
  '''<div class="notice" id="commNotice" hidden><b>New from <span class="swd"></span></b>
        <ul class="pts">
          <li><b>New rate</b><span>Your commission becomes a quarter (25%) of Northline’s margin on each item, rounded up to the next ₦500.</span></li>
          <li><b>Payouts</b><span>Your first sale is still paid straight away, then every 5 items.</span></li>
          <li><b>Prices</b><span>Most prices go down at the same time, so items are easier to sell.</span></li>
          <li><b>Before <span class="swd"></span></b><span>Orders sent before then earn today’s rate. Every item will keep showing what you earn.</span></li>
        </ul></div>'''),
]

PTS_CSS = """
/* commission points: short labelled rows */
.pts{list-style:none;margin:10px 0 0;padding:0;display:grid}
.pts[hidden]{display:none}
.pts li{display:grid;grid-template-columns:104px minmax(0,1fr);gap:12px;padding:9px 0;border-top:1px solid var(--line);font-size:14px;line-height:1.45;color:var(--ink-2)}
.pts li:first-child{border-top:0}
.pts li>b{font:600 11.5px/1.5 var(--ui);letter-spacing:.07em;text-transform:uppercase;color:var(--ink)}
.notice>b{display:block}.notice .pts{margin-top:4px}.notice .pts li{border-color:rgba(74,52,38,.18)}
@media (max-width:380px){.pts li{grid-template-columns:1fr;gap:2px}}
"""

SHOP_CSS = """
/* hero: shorter on phones so products start sooner; same information */
@media (max-width:560px){
  .intro{padding-block:18px 0!important;gap:8px!important}
  .intro h1{font-size:clamp(26px,7.6vw,32px)!important;line-height:1.08!important;max-width:none!important}
  .intro p{font-size:14px!important;line-height:1.45}
  .trust{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0!important;margin-top:10px!important;padding-block:0!important}
  .trust div{flex-direction:column!important;gap:0!important;padding:10px 8px 10px 0}
  .trust div+div{padding-left:10px;border-left:1px solid rgba(239,232,220,.18)}
  .trust svg{display:none}
  .trust b{font-size:12.5px!important;line-height:1.25}.trust span{font-size:11.5px!important;line-height:1.3}
}
/* size note */
.szn{margin:10px 0 0;font-size:13px;line-height:1.45;color:var(--ink-2)}
/* filters: common groups first, the rest folded under More filters */
/* brand: one swipeable row so a long list stays quick to scan */
.fgroup:has(.opt[data-k="brand"]) .opts{flex-wrap:nowrap;overflow-x:auto;padding-bottom:6px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.fgroup:has(.opt[data-k="brand"]) .opts::-webkit-scrollbar{display:none}
.fgroup:has(.opt[data-k="brand"]) .opt{flex:0 0 auto}
details.more{padding-top:0}
details.more>summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:48px;cursor:pointer;font:600 15px var(--ui)}
details.more>summary::-webkit-details-marker{display:none}
details.more>summary::after{content:"+";font:400 22px/1 var(--ui);color:var(--muted)}
details.more[open]>summary::after{content:"\\2212"}
details.more>summary small,details.more>summary em{font:400 12.5px var(--ui);font-style:normal;color:var(--muted);margin-left:auto}
details.more>summary em{color:var(--ink);font-weight:600}
"""

def main():
    kind, path = sys.argv[1], sys.argv[2]
    s = open(path, encoding="utf-8").read()
    if MARK in s: print(path, "already patched"); return
    edits = SHOP_EDITS if kind == "shop" else AGENT_EDITS
    for a, b in edits:
        n = s.count(a)
        if n == 0: sys.exit(f"anchor not found: {a[:70]}")
        s = s.replace(a, b)
    css = MARK + PTS_CSS + (SHOP_CSS if kind == "shop" else "")
    i = s.rindex("</style>"); s = s[:i] + css + s[i:]
    open(path, "w", encoding="utf-8").write(s); print(path, "patched", len(edits), "edits")
main()
