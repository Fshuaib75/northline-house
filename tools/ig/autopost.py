#!/usr/bin/env python3
"""Northline daily Instagram post.

Runs on GitHub Actions (see .github/workflows/ig-autopost.yml). Each run:
  1. picks the next style to post: this week's drop first, then styles you added recently,
     then best-value styles (₦18k–45k), alternating Men / Women so the feed stays mixed;
  2. draws a 1080×1350 feed image (and a 1080×1920 story) in the Sky & Ink look;
  3. publishes it to Instagram (and the Facebook Page, if set) with the Graph API;
  4. records the ref in tools/ig/posted.json so it isn't posted again for 60 days.

Secrets (repo → Settings → Secrets and variables → Actions):
  IG_USER_ID   Instagram professional account id (numbers)
  IG_TOKEN     Page access token with instagram_content_publish (never expires if made from a long-lived user token)
  FB_PAGE_ID   optional: also post the photo to the Facebook Page
Without IG_USER_ID / IG_TOKEN (or with "Preview only" ticked) the run is a PREVIEW: it makes the images and the
caption, keeps them as a workflow artifact for you to look at, and posts nothing.
"""
import datetime as dt, io, json, os, re, sys, time, urllib.parse, urllib.request
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "ig")
STATE = os.path.join(HERE, "posted.json")
REPO = os.environ.get("GITHUB_REPOSITORY", "Fshuaib75/northline-house")
BRANCH = "gh-pages"   # the workflow commits the images here; GITHUB_REF_NAME is "main" on scheduled runs
SHOP = "https://fshuaib75.github.io/northline-house/shop/"
GRAPH = "https://graph.facebook.com/v21.0"
INK, SKY, BG, PHOTO, MUTED = (14, 27, 44), (74, 159, 216), (247, 245, 240), (238, 242, 246), (201, 214, 227)

def load(path, default):
    try:
        with open(path, encoding="utf-8") as f: return json.load(f)
    except Exception: return default

def catalogue():
    html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    items = json.loads(re.search(r"let ALL = (\[.*?\]);\n", html, re.S).group(1))
    known = {i["ref"] for i in items}
    for a in load(os.path.join(ROOT, "products.json"), []):
        if a.get("ref") and a["ref"] not in known: items.append(dict(a))
    prices = load(os.path.join(ROOT, "prices.json"), {})
    lagos_today = (dt.datetime.utcnow() + dt.timedelta(hours=1)).date().isoformat()
    use_next = bool(prices.get("switchAt")) and lagos_today >= prices["switchAt"]
    hidden = set(prices.get("hidden", []))
    fresh = load(os.path.join(ROOT, "capone.json"), {}).get("styles", {})   # Capone's current photo links (weekly check)
    out = []
    for i in items:
        f = (fresh.get(i["ref"]) or {}).get("img")
        if f: i["imgs"] = f + [u for u in (i.get("imgs") or []) if u not in f]
        p = (prices.get("next", {}) if use_next else {}).get(i["ref"]) or prices.get("prices", {}).get(i["ref"])
        if not p or i["ref"] in hidden or not (i.get("img") or i.get("imgs")): continue
        i["price"] = p[0]; out.append(i)
    return out

def audience(i):
    g = i.get("g")
    if g in ("M", "W"): return g
    if g == "B" or i.get("for") in ("Girl", "Boy"): return "K"
    return "M" if i.get("for") == "Men" else "W"

def pick(items, state):
    recent = {r for r, d in state.get("posted", {}).items() if (dt.date.today() - dt.date.fromisoformat(d)).days < 60}
    pool = [i for i in items if i["ref"] not in recent]
    by = {i["ref"]: i for i in pool}
    drop = load(os.path.join(ROOT, "drop.json"), {})
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
        try: f.set_variation_by_axes([wght] if name == "Figtree.ttf" else [72, wght, 0, 0])   # Fraunces axes: opsz, wght, SOFT, WONK
        except Exception: pass
    return f

def fetch_photo(i):
    for u in (i.get("imgs") or []) + [i.get("full"), i.get("img")]:
        if not u: continue
        try:
            req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 (Northline poster)"})
            with urllib.request.urlopen(req, timeout=30) as r: return Image.open(io.BytesIO(r.read())).convert("RGB")
        except Exception as e: print("photo failed", u, e)
    raise SystemExit("no photo could be downloaded for " + i["ref"])

def naira(n): return "₦" + f"{int(round(n)):,}"

def sizes_line(i):
    z = i.get("sizes") or {"W": ["36", "41"], "M": ["40", "45"]}.get(i.get("g"), [])
    if not z or z == ["One size"]: return ""
    return ("Ages " if i.get("g") == "B" else "Sizes ") + (z[0] if len(z) == 1 else f"{z[0]}–{z[-1]}")

def wrap(draw, text, f, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=f) <= width: cur = t
        else: lines.append(cur); cur = w
    lines.append(cur); return [l for l in lines if l]

def card(i, photo, w, h, photo_h):
    im = Image.new("RGB", (w, h), BG); d = ImageDraw.Draw(im)
    ph = ImageOps.contain(photo, (w - 40, photo_h - 40)); box = Image.new("RGB", (w, photo_h), PHOTO)
    box.paste(ph, ((w - ph.width) // 2, (photo_h - ph.height) // 2)); im.paste(box, (0, 0))
    d.rectangle([0, photo_h, w, h], fill=INK); d.rectangle([0, photo_h, w, photo_h + 8], fill=SKY)
    x, y = 64, photo_h + 44
    d.text((x, y), "NORTHLINE HOUSE", font=font("Figtree.ttf", 26, 700), fill=SKY); y += 50
    for line in wrap(d, i["model"], font("Fraunces.ttf", 60, 600), w - 128)[:2]:
        d.text((x, y), line, font=font("Fraunces.ttf", 60, 600), fill=(255, 255, 255)); y += 70
    sub = " · ".join(t for t in (i.get("colour", ""), sizes_line(i)) if t)
    d.text((x, y + 4), sub, font=font("Figtree.ttf", 32, 500), fill=MUTED); y += 58
    d.text((x, y + 6), naira(i["price"]), font=font("Fraunces.ttf", 64, 700), fill=SKY)
    d.text((w - 64, h - 56), "Order: link in bio", font=font("Figtree.ttf", 28, 600), fill=MUTED, anchor="rs")
    return im

TAGS = {"M": "#mensfashion #palms #mensslides #lagosfashion #abujafashion", "W": "#womensfashion #slides #ladiesfootwear #lagosfashion #abujafashion",
        "K": "#babyclothes #kidsfashion #naijamums #lagosmums"}

def caption(i):
    desc = (i.get("desc") or "").replace(", confirm size before payment", "").replace("confirm size before payment", "").strip(" ,")
    lines = [f"{i['model']}" + (f" · {i['colour']}" if i.get("colour") else ""), desc[:1].upper() + desc[1:] if desc else "",
             "", f"{naira(i['price'])}" + (f" · {sizes_line(i)}" if sizes_line(i) else ""),
             "Chosen in Istanbul, delivered anywhere in Nigeria within 14 days of payment.", "",
             "To order: tap the link in our bio or send us a WhatsApp message (number in bio). We confirm your size before you pay.", "",
             f"Ref {i['ref']} · {i['brand']}", "", "#northlinehouse #turkishfashion " + TAGS[audience(i)]]
    return "\n".join(l for l in lines if l is not None).replace("\n\n\n", "\n\n")

def graph(path, params):
    data = urllib.parse.urlencode({**params, "access_token": os.environ["IG_TOKEN"]}).encode()
    with urllib.request.urlopen(urllib.request.Request(GRAPH + path, data=data), timeout=60) as r: return json.load(r)

def graph_get(path, params):
    q = urllib.parse.urlencode({**params, "access_token": os.environ["IG_TOKEN"]})
    with urllib.request.urlopen(GRAPH + path + "?" + q, timeout=60) as r: return json.load(r)

def publish(image_url, text, story_url=None):
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
        try: out["facebook"] = graph(f"/{os.environ['FB_PAGE_ID']}/photos", {"url": image_url, "caption": text + f"\n\nShop: {SHOP}"}).get("id")
        except Exception as e: print("facebook post failed:", e)
    return out

def main():
    state = load(STATE, {"posted": {}})
    i = pick(catalogue(), state)
    if not i: print("nothing left to post"); return
    os.makedirs(OUT, exist_ok=True)
    day = dt.date.today().isoformat(); base = f"{day}-{re.sub(r'[^A-Za-z0-9-]', '', i['ref'])}"
    photo = fetch_photo(i)
    card(i, photo, 1080, 1350, 1000).save(os.path.join(OUT, base + ".jpg"), quality=90)
    card(i, photo, 1080, 1920, 1500).save(os.path.join(OUT, base + "-story.jpg"), quality=90)
    text = caption(i); open(os.path.join(OUT, base + ".txt"), "w", encoding="utf-8").write(text)
    print(f"{i['ref']} · {i['model']} · {naira(i['price'])}\n---\n{text}\n---")
    with open(os.environ.get("GITHUB_OUTPUT", os.devnull), "a") as o: o.write(f"base={base}\nref={i['ref']}\n")

def publish_step():
    """Second step: the workflow has committed the images, so Instagram can fetch them from raw.githubusercontent.com."""
    base, ref = os.environ["BASE"], os.environ["REF"]
    state = load(STATE, {"posted": {}}); i = next(x for x in catalogue() if x["ref"] == ref)
    text = open(os.path.join(OUT, base + ".txt"), encoding="utf-8").read()
    raw = f"https://raw.githubusercontent.com/{REPO}/{BRANCH}/ig/"
    res = publish(raw + base + ".jpg", text, raw + base + "-story.jpg"); print("published", res)
    day = dt.date.today().isoformat()
    state["posted"][ref] = day; state["last_aud"] = audience(i)
    state.setdefault("log", []).append({"day": day, "ref": ref, **res}); state["log"] = state["log"][-200:]
    json.dump(state, open(STATE, "w"), indent=1)

if __name__ == "__main__":
    publish_step() if "--publish" in sys.argv else main()
