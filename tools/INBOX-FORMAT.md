# Review inbox: findings format

The weekly sourcing robot writes `findings.json` and seals it with `node tools/seal-inbox.mjs findings.json`.
Only the owner's book can open sealed batches. Nothing goes live until the owner approves it there.

```json
{"source": "weekly robot", "items": [ ... ]}
```

Item types (one object per item):

- **New style** — `{"t":"new","ref":"ZIYA-9910-BLK","brand":"Ziya","cat":"shoes","g":"M","model":"Leather velcro slide","colour":"Black","fam":"Black","desc":"genuine leather, 3 cm sole, confirm size before payment","kind":"slide","heel":"Flat","tl":1449.99,"img":"https://…","imgs":["https://…","https://…"],"sizes":["40","41","42","43","44","45"],"page":"https://…"}`
  - `ref`: stable and unique: BRANDCODE-productcode-colour, uppercase, no spaces.
  - `cat`: shoes | bags | baby. `g`: W (women) | M (men) | B (baby) | BG (bags). `for` (baby/bags only): Girl | Boy | Women | Men.
  - `kind` shoes: slide | sandal | flipflop | loafer | sneaker | other. Bags: shoulder | crossbody | handbag | tote | clutch | backpack | waist | other. Baby: dress | set | top | bodysuit | other.
  - `heel`: Flat | Low heel | Wedge | Platform | Heel | Closed (or "").
  - `fam` (colour group): Black, Brown, Tan & camel, Beige & nude, White, Metallic, Red & burgundy, Pink & purple, Blue, Green & khaki, Orange & yellow, Grey, Print & multi.
  - `tl`: current price on the brand site in lira (number). Optional `kg` overrides the shipping weight.
- **Price change** — `{"t":"price","ref":"<existing ref>","old":899.9,"now":1049.9,"page":"https://…"}` (only when the change is 5% or more)
- **Gone** — `{"t":"gone","ref":"<existing ref>","why":"Sold out in every size on the brand site","page":"https://…"}`
