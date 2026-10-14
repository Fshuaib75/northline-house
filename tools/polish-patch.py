#!/usr/bin/env python3
"""Northline UI polish (14 Oct 2026). Appends one small block of CSS to the BUILT pages. Style only: no markup, no scripts.
Idempotent: a marker comment stops it from being applied twice.

  python3 tools/polish-patch.py shop/index.html shop
  python3 tools/polish-patch.py index.html agent
  python3 tools/polish-patch.py orders/index.html orders

Run it after build.py and after the May-look patch: it sits on top of the May palette and keeps the May decisions
(sentence-case brand line, plain tags, 2px radii).
"""
import sys

MARK = "/*nl-polish-2026-10-14*/"

COMMON = """
/* solid bars: nothing shows through the header or the filter bar while scrolling */
.top,.tools{background:#F4F0E8!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}
.top{box-shadow:0 1px 0 var(--line)}
body{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
:focus-visible{outline:2px solid var(--ink);outline-offset:3px}
/* sizes: six sizes fit one row on a phone instead of leaving one on its own line */
.sizes{grid-template-columns:repeat(auto-fill,minmax(50px,1fr))}
.sz{min-height:44px}
@media (prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
"""

SHOP_AGENT = """
/* product cards: a little more air, and a slow zoom on hover (devices with a mouse only) */
@media (min-width:720px){.grid{gap:44px 20px}}
@media (hover:hover){
  .card .ph img{transition:transform .5s cubic-bezier(.2,.7,.2,1),opacity .35s ease}
  .card:hover .ph img{transform:scale(1.035)}
}
.chip,.bchip{min-height:36px;display:inline-flex;align-items:center}
.buy .add,.buy button.primary{min-height:50px;letter-spacing:.02em}
"""

AGENT_ONLY = """
/* agent page: the code box no longer stretches to the height of the commission box */
.agent{align-items:start}
.agent>.panel{align-self:start}
"""

ORDERS = """
/* orders page: same earth palette as the shop (it still had the old navy and sky blue) */
:root{
  --bg:#F4F0E8; --surface:#FBF8F2; --ink:#2E2C29; --ink-2:#4A443D; --muted:#6B6257; --line:#E2D9CA; --line-2:#D0C5B4;
  --sky:#5E5E45; --sky-ink:#5E5E45; --sky-soft:#ECE9DC; --gold:#4A3426; --gold-soft:#EFE7DA;
  --good:#3F6B3A; --good-soft:#E6EDDF; --warn:#8A5A1E; --warn-soft:#F3E8D6; --err:#9B2C25;
}
html,body{background:var(--bg)}
.logo i{color:var(--ink)}
.btn,.chip{border-radius:2px}
.btn.primary{border-radius:2px}
.panel{border-radius:3px}
.pill{border-radius:1px}
textarea,input,select{border-radius:2px;background:#FBF8F2;border-color:var(--line-2)}
textarea:focus,input:focus,select:focus{outline:2px solid var(--ink);outline-offset:1px}
"""

def main():
    path, kind = sys.argv[1], sys.argv[2]
    s = open(path, encoding="utf-8").read()
    if MARK in s:
        print(path, "already polished"); return
    css = MARK + COMMON
    if kind in ("shop", "agent"): css += SHOP_AGENT
    if kind == "agent": css += AGENT_ONLY
    if kind == "orders": css = MARK + ORDERS
    i = s.rindex("</style>")
    s = s[:i] + css + s[i:]
    open(path, "w", encoding="utf-8").write(s)
    print(path, "polished", len(css), "bytes of css")

main()
