#!/usr/bin/env python3
"""Northline daily Instagram post.

Runs on GitHub Actions (see .github/workflows/ig-autopost.yml). Each run:
  1. picks the next style to post: this week's drop first, then styles you added recently,
     then best-value styles (₦18k–45k), alternating Men / Women so the feed stays mixed;
  2. draws a 1080×1350 feed image (and a 1080×1920 story) in the May look (earth palette, peak-line logo);
  3. publishes it to Instagram (and the Facebook Page, if set) with the Graph API;
  4. records the ref in tools/ig/posted.json so it isn't posted again for 60 days.

Secrets (repo → Settings → Secrets and variables → Actions):
  IG_USER_ID   Instagram professional account id (numbers)
  IG_TOKEN     Page access token with instagram_content_publish (never expires if made from a long-lived user token)
  FB_PAGE_ID   optional: also post the photo to the Facebook Page
Unless IG_POSTING_ENABLED=true and credentials exist, runs produce the seven-day preview,
including pinned assets, at /ig-preview/. Preview mode never calls Meta or changes posting history.
"""
import datetime as dt, io, json, os, re, subprocess, sys, time, urllib.parse, urllib.request
from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageOps

ROOT = os.environ.get("NL_SITE_ROOT") or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "ig")
STATE = os.path.join(ROOT, "tools", "ig", "posted.json")
REPO = os.environ.get("GITHUB_REPOSITORY", "Fshuaib75/northline-house")
BRANCH = "gh-pages"   # the workflow commits the images here; GITHUB_REF_NAME is "main" on scheduled runs
SHOP = "https://northlinehouse.shop/shop/"
GRAPH = "https://graph.facebook.com/v21.0"
# the May look: charcoal text, soft white page, cream photo backdrop, muted text, muted black frame
INK, BG, PHOTO, MUTED, BLACK, CREAM2 = (46, 44, 41), (244, 240, 232), (233, 225, 211), (107, 98, 87), (31, 26, 22), (168, 156, 140)
BRAND = os.path.join(ROOT, "brand")

def load(path, default):
    try:
        with open(path, encoding="utf-8") as f: return json.load(f)
    except Exception: return default

def lagos_today():
    return dt.datetime.now(dt.timezone(dt.timedelta(hours=1))).date()

def next_post_day(now=None):
    now = (now or dt.datetime.now(dt.timezone.utc)).astimezone(dt.timezone(dt.timedelta(hours=1)))
    return now.date() + dt.timedelta(days=int((now.hour, now.minute) >= (18, 30)))

def active_drop(drop, today):
    if drop.get("week"):
        try:
            if not 0 <= (today - dt.date.fromisoformat(drop["week"])).days <= 7: return {**drop, "refs": []}
        except ValueError: return {**drop, "refs": []}
    return drop

def product_link(ref, channel):
    return SHOP + "?" + urllib.parse.urlencode({"i": ref, "a": channel})

def photo_key(url):
    return urllib.parse.unquote(str(url).split("?")[0].rstrip("/").split("/")[-1])

def photo_policy():
    return (load(os.path.join(ROOT, "photo-rules.json"), {}), load(os.path.join(ROOT, "photo-checked.json"), {}))

def product_photo(url, rules, checked):
    if not url: return False
    if urllib.parse.urlsplit(str(url)).scheme not in ("", "http", "https"): return False
    key = photo_key(url)
    allowed = set(rules.get("allowed", []))
    score = checked.get("scores", {}).get(key)
    if key not in allowed and (key in rules.get("photos", []) or isinstance(score, (int, float)) and score >= .5): return False
    label = checked.get("labels", {}).get(url, checked.get("labels", {}).get(key))
    if label is None: label = checked.get("types", {}).get(url, checked.get("types", {}).get(key))
    if label is None and isinstance(score, dict): label = score.get("type") or score.get("label")
    if isinstance(label, dict): label = label.get("type") or label.get("label")
    if label:
        # A known non-product label always wins over an innocent-looking URL.
        return str(label).lower() in {"whole", "closeup", "product", "product_only", "product-only", "flatlay", "detail", "sole", "back"}
    return not any(s in urllib.parse.unquote(str(url)).lower() for s in ("olcu", "ölçü", "beden", "size", "chart"))

def minimal_flags(items):
    result = subprocess.run(["node", os.path.join(HERE, "minimal-check.mjs")], input=json.dumps(items), text=True, capture_output=True, check=True)
    flags = json.loads(result.stdout)
    if len(flags) != len(items): raise RuntimeError("Incomplete style-rule results")
    return flags

def eligible_items(items, drop):
    rules, checked = photo_policy()
    out = []
    for i, rule in zip(items, minimal_flags(items)):
        urls = list(dict.fromkeys([*(i.get("imgs") or []), i.get("full"), i.get("img")]))
        safe = [u for u in urls if product_photo(u, rules, checked)]
        if not rule["ok"] or not safe or i["price"] > 70000 and i["ref"] not in drop.get("refs", []): continue
        out.append({**i, "imgs": safe, "img": safe[0], "full": safe[0]})
    return out

def catalogue():
    html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    items = json.loads(re.search(r"let ALL = (\[.*?\]);\n", html, re.S).group(1))
    known = {i["ref"] for i in items}
    for a in load(os.path.join(ROOT, "products.json"), []):
        if a.get("ref") and a["ref"] not in known: items.append(dict(a))
    prices = load(os.path.join(ROOT, "prices.json"), {})
    use_next = bool(prices.get("switchAt")) and lagos_today().isoformat() >= prices["switchAt"]
    hidden = set(prices.get("hidden", []))
    # Owner rule: product-only photos, never a female body (photo-rules.json, tools/photos/no_people.py).
    rules, checked = photo_policy()
    clean = lambda urls: [u for u in urls if product_photo(u, rules, checked)]
    fresh = load(os.path.join(ROOT, "capone.json"), {}).get("styles", {})   # Capone's current photo links (weekly check)
    brands = load(os.path.join(ROOT, "brands.json"), {}).get("styles", {})
    out = []
    for i in items:
        c = fresh.get(i["ref"]) or {}
        if c and (not c.get("on") or c.get("stock") == []): continue   # sold out at Capone
        f = c.get("img")
        if f: i["imgs"] = f + [u for u in (i.get("imgs") or []) if u not in f]
        stock = c if c else brands.get(i["ref"], {})
        if stock and (stock.get("on") is False or stock.get("stock") == []): continue
        if isinstance(stock.get("stock"), list): i["sizes"] = list(stock["stock"])
        i["imgs"] = clean(list(dict.fromkeys([*(i.get("imgs") or []), i.get("full"), i.get("img")])))
        for k in ("img", "full"):
            if i.get(k) and not clean([i[k]]): i[k] = (i["imgs"] or [None])[0]
        p = (prices.get("next", {}) if use_next else {}).get(i["ref"]) or prices.get("prices", {}).get(i["ref"])
        if not p or i["ref"] in hidden or not (i.get("img") or i.get("imgs")): continue
        i["price"] = p[0]; out.append(i)
    return out

def audience(i):
    g = i.get("g")
    if g in ("M", "W"): return g
    if g == "B" or i.get("for") in ("Girl", "Boy"): return "K"
    return "M" if i.get("for") == "Men" else "W"

def pick(items, state, today=None, drop=None):
    today = today or lagos_today()
    recent = {r for r, d in state.get("posted", {}).items() if (today - dt.date.fromisoformat(d)).days < 60}
    drop = active_drop(drop if drop is not None else load(os.path.join(ROOT, "drop.json"), {}), today)
    pool = [i for i in eligible_items(items, drop) if i["ref"] not in recent]
    by = {i["ref"]: i for i in pool}
    order = [by[r] for r in drop.get("refs", []) if r in by]
    lo_hi = {"W": (18000, 45000), "M": (18000, 45000), "K": (8000, 30000)}
    in_band = lambda i: lo_hi[audience(i)][0] <= i["price"] <= lo_hi[audience(i)][1]
    added = sorted([i for i in pool if i.get("added")], key=lambda i: (not in_band(i), -int(i["added"].replace("-", ""))))
    value = [i for i in pool if in_band(i) and len(i.get("imgs") or []) > 1]
    value.sort(key=lambda i: (i["brand"], i["price"]))
    seen, cands = set(), []
    for i in order + added + value:
        if i["ref"] not in seen: seen.add(i["ref"]); cands.append(i)
    if not cands: return None
    want = "W" if state.get("last_aud") == "M" else "M"          # alternate Men / Women
    first = cands[0] if cands[0] in order else next((i for i in cands if audience(i) == want), cands[0])
    return first

def font(name, size, wght=None):
    f = ImageFont.truetype(os.path.join(HERE, "fonts", name), size)
    if wght:
        try: f.set_variation_by_axes([wght] if name == "Jost.ttf" else [wght, min(72, max(6, size))])   # Newsreader axes: wght, opsz
        except Exception: pass
    return f

def logo(im, x, y, height, colour="ink", anchor="left"):
    """Paste the peak-line wordmark (brand/northline-wordmark-<colour>.png, transparent) at height px."""
    lg = Image.open(os.path.join(BRAND, f"northline-wordmark-{colour}.png")).convert("RGBA")
    lg = lg.resize((round(lg.width * height / lg.height), height), Image.LANCZOS)
    if anchor == "center": x -= lg.width // 2
    elif anchor == "right": x -= lg.width
    im.paste(lg, (x, y), lg)

def fetch_photo(i):
    rules, checked = photo_policy()
    for u in (i.get("imgs") or []) + [i.get("full"), i.get("img")]:
        if not product_photo(u, rules, checked): continue
        try:
            req = urllib.request.Request(urllib.parse.urljoin("https://northlinehouse.shop/", u), headers={"User-Agent": "Mozilla/5.0 (Northline poster)"})
            with urllib.request.urlopen(req, timeout=30) as r: return Image.open(io.BytesIO(r.read())).convert("RGB")
        except Exception: pass
    raise RuntimeError("No product photo could be downloaded for " + i["ref"])

def naira(n): return "₦" + f"{int(round(n)):,}"

def sizes_line(i):
    z = [str(s) for s in i.get("sizes", []) if str(s) not in ("00", "0", "One size", "")]
    if not z or i.get("cat") == "bags" or i.get("g") == "BG": return ""
    return ("Ages " if i.get("g") == "B" else "Sizes ") + ", ".join(z)

def wrap(draw, text, f, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=f) <= width: cur = t
        else: lines.append(cur); cur = w
    lines.append(cur); return [l for l in lines if l]

def draw_price(d, x, y, amount, size, align="left"):
    """₦ from Newsreader (Jost has no naira sign), digits in Jost 500; y is the baseline."""
    sign, num = font("Newsreader.ttf", size, 500), font("Jost.ttf", size, 500)
    digits = f"{int(round(amount)):,}"; ws = d.textlength("₦", font=sign); total = ws + d.textlength(digits, font=num)
    if align == "right": x -= total
    d.text((x, y), "₦", font=sign, fill=INK, anchor="ls"); d.text((x + ws, y), digits, font=num, fill=INK, anchor="ls")
    return total

def photo_box(photo, w, h):
    """The product photo fitted on cream; white studio backgrounds melt into the cream (multiply), as on the shop."""
    box = Image.new("RGB", (w, h), PHOTO)
    ph = ImageOps.contain(photo, (int(w * .86), int(h * .86)))
    pos = ((w - ph.width) // 2, (h - ph.height) // 2)
    region = box.crop((pos[0], pos[1], pos[0] + ph.width, pos[1] + ph.height))
    box.paste(ImageChops.multiply(region, ph), pos)
    return box

def card(i, photo, w, h, photo_h):
    im = Image.new("RGB", (w, h), BG); d = ImageDraw.Draw(im)
    story = h > w * 1.5
    serif, sans = (lambda n, wt=400: font("Newsreader.ttf", n, wt)), (lambda n, wt=400: font("Jost.ttf", n, wt))
    if story:
        logo(im, w // 2, 110, 64, "ink", "center")
        box = photo_box(photo, w - 120, photo_h)
        mask = Image.new("L", box.size, 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, box.width - 1, box.height - 1], 16, fill=255)
        im.paste(box, (60, 230), mask)
        x, y = 60, 230 + photo_h + 60
        d.text((x, y), i.get("brand", ""), font=sans(32), fill=MUTED); y += 54
        d.text((x, y), wrap(d, i["model"], serif(72), w - 120)[0], font=serif(72), fill=INK); y += 96
        sub = " · ".join(t for t in (i.get("colour", ""), sizes_line(i)) if t)
        if sub: d.text((x, y), sub, font=sans(36), fill=MUTED); y += 66
        draw_price(d, x, y + 84, i["price"], 96)
        d.text((w // 2, h - 60), "Order: link in bio", font=sans(32), fill=MUTED, anchor="ms")
    else:
        im.paste(photo_box(photo, w, photo_h), (0, 0))
        x, y = 64, photo_h + 36
        pw = d.textlength("₦", font=serif(64, 500)) + d.textlength(f"{int(round(i['price'])):,}", font=sans(64, 500))
        d.text((x, y), i.get("brand", ""), font=sans(28), fill=MUTED)
        d.text((x, y + 44), wrap(d, i["model"], serif(58), w - 128 - pw - 40)[0], font=serif(58), fill=INK)
        sub = " · ".join(t for t in (i.get("colour", ""), sizes_line(i)) if t)
        if sub: d.text((x, y + 124), sub, font=sans(30), fill=MUTED)
        draw_price(d, w - 64, y + 108, i["price"], 64, "right")
        logo(im, x, h - 74, 34, "ink")
        d.text((w - 64, h - 44), "Order: link in bio", font=sans(28), fill=MUTED, anchor="rs")
    return im

TAGS = {"M": "#mensfashion #palms #mensslides #lagosfashion #abujafashion", "W": "#womensfashion #slides #ladiesfootwear #lagosfashion #abujafashion",
        "K": "#babyclothes #kidsfashion #naijamums #lagosmums"}

def caption(i):
    desc = (i.get("desc") or "").replace(", confirm size before payment", "").replace("confirm size before payment", "").strip(" ,")
    lines = [f"{i['model']}" + (f" · {i['colour']}" if i.get("colour") else ""), desc[:1].upper() + desc[1:] if desc else "",
             "", f"{naira(i['price'])}" + (f" · {sizes_line(i)}" if sizes_line(i) else ""),
             "Price includes shipping to Nigeria. Delivered within 14 days of payment. Delivery from our Abuja pickup point is paid on delivery.",
             "Bank transfer after confirmation. No size exchanges.", "",
             "To order: tap the link in our bio or send us a WhatsApp message (number in bio). We confirm your size before you pay.", "",
             f"Ref {i['ref']} · {i['brand']}", "", "#northlinehouse " + TAGS[audience(i)]]
    return "\n".join(l for l in lines if l is not None).replace("\n\n\n", "\n\n")

def graph(path, params):
    data = urllib.parse.urlencode({**params, "access_token": os.environ["IG_TOKEN"]}).encode()
    with urllib.request.urlopen(urllib.request.Request(GRAPH + path, data=data), timeout=60) as r: return json.load(r)

def graph_get(path, params):
    q = urllib.parse.urlencode({**params, "access_token": os.environ["IG_TOKEN"]})
    with urllib.request.urlopen(GRAPH + path + "?" + q, timeout=60) as r: return json.load(r)

def publish(image_url, text, story_url=None, product_url=None):
    if os.environ.get("FB_PAGE_ID") and not product_url: raise ValueError("Facebook requires a product link")
    uid = os.environ["IG_USER_ID"]; out = {}
    for kind, url in (("feed", image_url), ("story", story_url)):
        if not url: continue
        params = {"image_url": url} | ({"caption": text} if kind == "feed" else {"media_type": "STORIES"})
        c = graph(f"/{uid}/media", params)["id"]
        for _ in range(20):
            if graph_get(f"/{c}", {"fields": "status_code"}).get("status_code") in ("FINISHED", None): break
            time.sleep(6)
        out[kind] = graph(f"/{uid}/media_publish", {"creation_id": c}).get("id")
    if os.environ.get("FB_PAGE_ID"):
        try: out["facebook"] = graph(f"/{os.environ['FB_PAGE_ID']}/photos", {"url": image_url, "caption": text + f"\n\nShop: {product_url}"}).get("id")
        except Exception: print("Facebook post failed; check the workflow credentials.")
    return out

def main():
    state = load(STATE, {"posted": {}})
    i = pick(catalogue(), state)
    if not i: print("nothing left to post"); return
    os.makedirs(OUT, exist_ok=True)
    day = lagos_today().isoformat(); base = f"{day}-{re.sub(r'[^A-Za-z0-9-]', '', i['ref'])}"
    photo = fetch_photo(i)
    card(i, photo, 1080, 1350, 1000).save(os.path.join(OUT, base + ".jpg"), quality=90)
    card(i, photo, 1080, 1920, 1180).save(os.path.join(OUT, base + "-story.jpg"), quality=90)
    text = caption(i); open(os.path.join(OUT, base + ".txt"), "w", encoding="utf-8").write(text)
    print(f"{i['ref']} · {i['model']} · {naira(i['price'])}\n---\n{text}\n---")
    with open(os.environ.get("GITHUB_OUTPUT", os.devnull), "a") as o: o.write(f"base={base}\nref={i['ref']}\n")

def publish_step():
    """Second step: the workflow has committed the images, so Instagram can fetch them from raw.githubusercontent.com."""
    if os.environ.get("IG_POSTING_ENABLED") != "true": raise RuntimeError("Posting disabled until the phone preview is approved")
    base, ref = os.environ["BASE"], os.environ["REF"]
    state = load(STATE, {"posted": {}}); i = next(x for x in eligible_items(catalogue(), active_drop(load(os.path.join(ROOT, "drop.json"), {}), lagos_today())) if x["ref"] == ref)
    text = open(os.path.join(OUT, base + ".txt"), encoding="utf-8").read()
    if text != caption(i): raise RuntimeError("Catalogue changed since rendering; regenerate before posting")
    raw = f"https://raw.githubusercontent.com/{REPO}/{BRANCH}/ig/"
    story_url = raw + base + "-story.jpg" if os.environ.get("IG_AUTO_STORY", "true") != "false" else None
    res = publish(raw + base + ".jpg", text, story_url, product_link(ref, "FB")); print("published", res)
    day = lagos_today().isoformat()
    state.setdefault("posted", {})[ref] = day; state["last_aud"] = audience(i)
    state.setdefault("log", []).append({"day": day, "ref": ref, **res}); state["log"] = state["log"][-200:]
    json.dump(state, open(STATE, "w"), indent=1)

if __name__ == "__main__":
    if "--preview-week" in sys.argv:
        from preview_week import generate
        generate()
    elif "--publish" in sys.argv: publish_step()
    else: main()
