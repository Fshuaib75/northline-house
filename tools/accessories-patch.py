#!/usr/bin/env python3
"""Add the Accessories section (wallets, belts, gift sets) to the built agent site and shop.
Usage (from repo root):  python3 tools/accessories-patch.py index.html shop/index.html
Safe to run twice. A rebuild of the pages from the templates overwrites it: re-run after every build.
Items opt in with  cat:"accessories", g:"AC", for:"Men", kind: wallet | belt | giftset | other."""
import sys, re
EDITS = [
 # section + order
 ('const secOf=i=>i.g==="BG"?"Bags":', 'const secOf=i=>i.cat==="accessories"?"Accessories":i.g==="BG"?"Bags":'),
 ('const SEC_ORDER=["Shoes","Clothing","Bags"]', 'const SEC_ORDER=["Shoes","Clothing","Bags","Accessories"]'),
 ('Bags:["shoulder","handbag","crossbody","tote","clutch","backpack","waist","other"]}', 'Bags:["shoulder","handbag","crossbody","tote","clutch","backpack","waist","other"],Accessories:["wallet","belt","giftset","other"]}'),
 ('waist:"Waist bags"}', 'waist:"Waist bags",wallet:"Wallets",belt:"Belts",giftset:"Gift sets"}'),
 ('sec==="Bags"?"Other bags":"More clothing"', 'sec==="Bags"?"Other bags":sec==="Accessories"?"More accessories":"More clothing"'),
 ('...KIND_ORDER.Bags]', '...KIND_ORDER.Bags,...KIND_ORDER.Accessories]'),
 # one-size default, "pieces" not "pairs", no shoe size guide
 ('BG:["One size"],', 'BG:["One size"],AC:["One size"],'),
 ('(g==="B"||g==="BG"||g==="CL")', '(g==="B"||g==="BG"||g==="CL"||g==="AC")'),
 ('$("pdSG").hidden=i.g==="BG"||i.g==="CL";', '$("pdSG").hidden=i.g==="BG"||i.g==="CL"||i.g==="AC";'),
 ('const sg=i.g!=="BG"&&i.g!=="CL",', 'const sg=i.g!=="BG"&&i.g!=="CL"&&i.g!=="AC",'),
]
MARK = "/*nl-accessories*/"
for path in sys.argv[1:]:
    s = open(path, encoding="utf-8").read()
    if MARK in s: print(path, "already patched"); continue
    done = 0
    for a, b in EDITS:
        n = s.count(a)
        if n: s = s.replace(a, b); done += 1
        else: print("  not found (ok if this page lacks it):", a[:60])
    s = s.replace("<script>\nlet ALL", "<script>" + MARK + "\nlet ALL", 1)
    open(path, "w", encoding="utf-8").write(s)
    print(path, "patched", done, "of", len(EDITS))
