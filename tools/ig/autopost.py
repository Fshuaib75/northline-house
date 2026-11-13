#!/usr/bin/env python3
"""Northline daily Instagram post.

Runs on GitHub Actions (see .github/workflows/ig-autopost.yml). Each run:
  1. picks men's styles and accessories using IG_AUDIENCE, with brand variety,
     ₦25k–45k value preference, then drop and recent-addition priority;
  2. draws a 1080×1350 feed image (and a 1080×1920 story) in the May look (earth palette, peak-line logo);
  3. publishes it to Instagram (and the Facebook Page, if set) with the Graph API;
  4. records the style and its colour refs in tools/ig/posted.json so it isn't posted again for 60 days.

Secrets (repo → Settings → Secrets and variables → Actions):
  IG_USER_ID   Instagram professional account id (numbers)
  IG_TOKEN     Page access token with instagram_content_publish (never expires if made from a long-lived user token)
  FB_PAGE_ID   optional: also post the photo to the Facebook Page
Unless IG_POSTING_ENABLED=true and credentials exist, runs produce the seven-day preview,
including pinned assets, at /ig-preview/. Preview mode never calls Meta or changes posting history.
"""
import datetime as dt, io, json, os, re, subprocess, sys, time, urllib.parse, urllib.request
from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageOps, ImageStat, ImageFilter

ROOT = os.environ.get("NL_SITE_ROOT") or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "ig")
STATE = os.path.join(ROOT, "tools", "ig", "posted.json")
REPO = os.environ.get("GITHUB_REPOSITORY", "Fshuaib75/northline-house")
BRANCH = "gh-pages"   # the workflow commits the images here; GITHUB_REF_NAME is "main" on scheduled runs
SHOP = "https://northlinehouse.shop/shop/"
GRAPH = "https://graph.facebook.com/v21.0"
IG_AUDIENCE = "M"  # Owner decision. Set to None to restore mixed Men/Women selection.
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
    with open(os.path.join(ROOT, "index.html"), encoding="utf-8") as source:
        html = source.read()
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

def style_key(item):
    if item.get("grp"):
        return "grp:" + str(item["grp"])
    # Supplier colour tokens, including Capone's N/M/L codes. Preserve model IDs
    # and audience suffixes; generic model names are never used as identity.
    tokens = str(item["ref"]).upper().split("-")
    if item.get("brand", "").casefold() == "slazenger" and len(tokens) == 3 and re.fullmatch(r"\d{3}[A-Z]?", tokens[-1]):
        tokens.pop()
    if item.get("brand", "").casefold() == "defacto":
        tokens[-1] = re.sub(r"(?<=AX)(?:BK|BN|BG|NV|GR|KH|WT)\d+$", "", tokens[-1])
    colour = r"(?:BLK|BRN|BGE|WHT|TAN|KHK|NVY|MNK|GRY|GREY|RED|BLU|BLUE|PNK|PINK|GRN|CRM|MLT|GLD|SLV|ANT|TPE|N\d+|M\d+|L\d+)"
    position = len(tokens) - 2 if tokens[-1] in ("M", "W", "K") else len(tokens) - 1
    # A numeric disambiguator after a colour is part of the reference, not a model.
    if position > 1 and tokens[position].isdigit() and re.fullmatch(colour, tokens[position-1]):
        tokens.pop(position)
        position -= 1
    if position > 0 and re.fullmatch(colour, tokens[position]):
        tokens.pop(position)
    return "|".join((item.get("brand", "").casefold(), str(item.get("g", audience(item))), "-".join(tokens)))

def style_colours(item):
    return item.get("colours") or [item]

def record_post(state, item, day):
    state.setdefault("posted_styles", {})[style_key(item)] = day
    for colour in style_colours(item):
        state.setdefault("posted", {})[colour["ref"]] = day
    state["last_aud"] = audience(item)
    state["last_brand"] = item.get("brand")

def display_name(item):
    name = re.sub(r"^\d+[\s-]+", "", item.get("model", "")).strip()
    if name.casefold() not in {"", "shoe", "shoes", "slide", "slides", "sandal", "sandals", "bag", "accessory"}:
        return name
    kind = item.get("kind") or ({"slide": "slide", "slides": "slide", "sandal": "sandal", "sandals": "sandal"}.get(name.casefold())) or item.get("cat", "product")
    desc = clean_description(item).split(",")[0].strip(" .")
    if desc and not desc.casefold().startswith("confirm "):
        return desc[:1].upper() + desc[1:] + (" " + kind if kind not in desc.casefold() and kind not in {"shoes", "accessories"} else "")
    return {"shoes": "Everyday footwear", "bags": "Everyday bag", "accessories": "Everyday accessory"}.get(kind, "Everyday " + kind)

def clean_description(item):
    desc = re.sub(r"[,;]?\s*confirm size before payment\.?", "", item.get("desc", ""), flags=re.I).strip(" ,.;")
    return desc[:1].upper() + desc[1:]

def grouped_items(items, drop):
    groups = {}
    for item in eligible_items(items, drop):
        groups.setdefault(style_key(item), []).append(item)
    result = []
    for key, colours in groups.items():
        unique = {}
        for colour in colours:
            unique.setdefault(colour.get("colour") or colour["ref"], colour)
        colours = list(unique.values())
        result.append({**colours[0], "colours": colours})
    return result

def pick(items, state, today=None, drop=None):
    today = today or lagos_today()
    drop = active_drop(drop if drop is not None else load(os.path.join(ROOT, "drop.json"), {}), today)
    recent_refs = {r for r, day in state.get("posted", {}).items()
                   if (today - dt.date.fromisoformat(day)).days < 60}
    recent_styles = {key for key, day in state.get("posted_styles", {}).items()
                     if (today - dt.date.fromisoformat(day)).days < 60}
    # Legacy history for any colour suppresses the entire group, including hidden colours.
    recent_styles.update(style_key(i) for i in items if i["ref"] in recent_refs)
    pool = [i for i in grouped_items(items, drop) if style_key(i) not in recent_styles
            and (IG_AUDIENCE is None or audience(i) == IG_AUDIENCE)]
    if not pool:
        return None
    want = "W" if state.get("last_aud") == "M" else "M"
    candidates = pool if IG_AUDIENCE else ([i for i in pool if audience(i) == want] or pool)
    different_brand = [i for i in candidates if i.get("brand") != state.get("last_brand")]
    candidates = different_brand or candidates
    drop_refs = set(drop.get("refs", []))
    def priority(item):
        in_band = 25000 <= item["price"] <= 45000
        in_drop = any(c["ref"] in drop_refs for c in style_colours(item))
        return (not in_band, not in_drop, not bool(item.get("added")),
                -int(str(item.get("added") or "0").replace("-", "")), item["price"], style_key(item))
    return min(candidates, key=priority)

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
            with urllib.request.urlopen(req, timeout=30) as r:
                photo = Image.open(io.BytesIO(r.read())).convert("RGB")
            photo_box(photo.copy(), 200, 200, i)
            return photo
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

def photo_box(photo, w, h, item=None):
    """Trim neutral studio margins, preserving pale products and shaded footbeds."""
    photo = photo.convert("RGB")
    # Work at bounded resolution for predictable rendering cost.
    photo.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
    sample = max(1, min(photo.size) // 40)
    patches = [photo.crop((x, y, x + sample, y + sample))
               for x, y in ((0, 0), (photo.width-sample, 0),
                            (0, photo.height-sample), (photo.width-sample, photo.height-sample))]
    background = tuple(round(sorted(ImageStat.Stat(p).median[channel] for p in patches)[1])
                       for channel in range(3))
    if min(background) < 180 or max(background) - min(background) > 35:
        raise ValueError("Photo needs a clean neutral studio background")
    difference = ImageChops.difference(photo, Image.new("RGB", photo.size, background))
    channels = difference.split()
    distance = ImageChops.lighter(ImageChops.lighter(channels[0], channels[1]), channels[2])
    # Flood-fill from the image border to preserve pale areas enclosed by the shoe.
    pale_product = any(word in str((item or {}).get("colour", "")).casefold()
                       for word in ("white", "cream", "ivory", "beige", "mink"))
    threshold = 6 if pale_product else 24
    mask = distance.point(lambda value: 0 if value < threshold else 255)
    for point in ((0, 0), (photo.width-1, 0), (0, photo.height-1), (photo.width-1, photo.height-1)):
        if mask.getpixel(point) == 0:
            ImageDraw.floodfill(mask, point, 128, thresh=0)
    # Enclosed near-white studio gaps need separate treatment. Large pale
    # surfaces and declared white/cream products retain their enclosed pixels.
    if min(background) >= 230:
        pixels = photo.load()
        seen = mask.copy()
        for y in range(photo.height):
            for x in range(photo.width):
                if seen.getpixel((x, y)) != 0:
                    continue
                # Flood-fill on a copy marks a component once. Only tiny, almost
                # paper-white components qualify; shaded footbeds stay intact.
                queue, points = [(x, y)], []
                seen.putpixel((x, y), 64)
                while queue:
                    px, py = queue.pop()
                    points.append((px, py))
                    for nx, ny in ((px-1, py), (px+1, py), (px, py-1), (px, py+1)):
                        if 0 <= nx < photo.width and 0 <= ny < photo.height and seen.getpixel((nx, ny)) == 0:
                            seen.putpixel((nx, ny), 64)
                            queue.append((nx, ny))
                # On a pale product against a grey studio backdrop, exact grey
                # gaps can be distinguished from brighter white straps. Against
                # white-on-white, preserve ambiguous enclosed pale components.
                if pale_product:
                    background_pixels = sum(max(abs(pixels[p][c]-background[c]) for c in range(3)) <= 2 for p in points)
                    removable = min(background) < 245 and background_pixels >= len(points) * .85
                else:
                    near_white = sum(min(pixels[p]) >= 248 and max(pixels[p])-min(pixels[p]) <= 5 for p in points)
                    removable = near_white >= len(points) * .75
                if len(points) <= photo.width * photo.height * .12 and removable:
                    for point in points:
                        mask.putpixel(point, 128)
    mask = mask.point(lambda value: 0 if value == 128 else 255)
    bounds = mask.getbbox()
    if not bounds:
        raise ValueError("No product found in photo")
    rgba = photo.convert("RGBA")
    rgba.putalpha(mask.filter(ImageFilter.GaussianBlur(.7)))
    rgba = rgba.crop(bounds)
    rgba = ImageOps.contain(rgba, (round(w * .79), round(h * .90)), Image.Resampling.LANCZOS)
    box = Image.new("RGB", (w, h), PHOTO)
    box.paste(rgba, ((w-rgba.width)//2, (h-rgba.height)//2), rgba)
    return box

def card(i, photo, w, h, photo_h):
    im = Image.new("RGB", (w, h), BG); d = ImageDraw.Draw(im)
    story = h > w * 1.5
    serif, sans = (lambda n, wt=400: font("Newsreader.ttf", n, wt)), (lambda n, wt=400: font("Jost.ttf", n, wt))
    if story:
        logo(im, w // 2, 110, 64, "ink", "center")
        box = photo_box(photo, w - 120, photo_h, i)
        mask = Image.new("L", box.size, 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, box.width - 1, box.height - 1], 16, fill=255)
        im.paste(box, (60, 230), mask)
        x, y = 60, 230 + photo_h + 60
        d.text((x, y), i.get("brand", ""), font=sans(36), fill=MUTED); y += 54
        d.text((x, y), wrap(d, display_name(i), serif(72), w - 120)[0], font=serif(72), fill=INK); y += 96
        sub = i.get("colour", "")
        if sub: d.text((x, y), sub, font=sans(36), fill=MUTED); y += 66
        draw_price(d, x, y + 84, i["price"], 96)
        d.text((w // 2, h - 60), "Order: link in bio", font=sans(36), fill=MUTED, anchor="ms")
    else:
        im.paste(photo_box(photo, w, photo_h, i), (0, 0))
        x, y = 64, photo_h + 36
        pw = d.textlength("₦", font=serif(64, 500)) + d.textlength(f"{int(round(i['price'])):,}", font=sans(64, 500))
        d.text((x, y), i.get("brand", ""), font=sans(36), fill=MUTED)
        for n, line in enumerate(wrap(d, display_name(i), serif(58), w - 128)):
            d.text((x, y + 50 + n * 66), line, font=serif(58), fill=INK)
        sub = i.get("colour", "")
        if sub: d.text((x, y + 200), sub, font=sans(36), fill=MUTED)
        draw_price(d, w - 64, y + 270, i["price"], 64, "right")
        logo(im, x, h - 74, 34, "ink")
        d.text((w - 64, h - 44), "Order: link in bio", font=sans(36), fill=MUTED, anchor="rs")
    return im

def hashtags(item):
    text = " ".join(str(item.get(key, "")) for key in ("cat", "kind", "model", "desc")).casefold()
    if item.get("cat") == "bags":
        product = "#bags #everydaycarry"
    elif item.get("cat") == "accessories":
        product = "#wallets" if "wallet" in text else "#belts" if "belt" in text else "#accessories"
    elif "slide" in text or "sandal" in text or "palm" in text:
        product = "#slides #sandals"
    elif item.get("cat") == "shoes":
        product = "#footwear #shoes"
    else:
        product = "#everydaystyle"
    audience_tag = {"M": "#mensfashion", "W": "#womensfashion", "K": "#kidsfashion"}[audience(item)]
    return " ".join(("#northlinehouse", audience_tag, product, "#lagosfashion #abujafashion"))

def caption(i):
    colours = style_colours(i)
    lines = [display_name(i) + " · " + i.get("brand", ""), clean_description(i)]
    for colour in colours:
        detail = " · ".join(filter(None, [colour.get("colour"), naira(colour["price"]), sizes_line(colour)]))
        lines.append(detail)
    lines.extend(["", "Shipping to Nigeria included · within 14 days of payment.",
                  "Abuja onward courier paid on delivery. Bank transfer after size confirmation. No size exchanges.",
                  "Order via the link in bio or WhatsApp.", "", hashtags(i)])
    return "\n".join(lines)

def graph(path, params):
    data = urllib.parse.urlencode({**params, "access_token": os.environ["IG_TOKEN"]}).encode()
    with urllib.request.urlopen(urllib.request.Request(GRAPH + path, data=data), timeout=60) as r: return json.load(r)

def graph_get(path, params):
    q = urllib.parse.urlencode({**params, "access_token": os.environ["IG_TOKEN"]})
    with urllib.request.urlopen(GRAPH + path + "?" + q, timeout=60) as r: return json.load(r)

def checkpoint_call(state, platform, persist, path, params):
    previous = state.get(platform, {})
    if previous.get("id"): return previous["id"]
    if previous.get("pending"): raise RuntimeError("Uncertain " + platform + " publication: reconcile before retrying")
    state[platform] = {"pending": True}
    persist()  # Must be durable before the external side effect.
    result = graph(path, params).get("id")
    if not result: raise RuntimeError("Publication returned no ID; reconcile before retrying")
    state[platform] = {"id": result}
    persist()
    return result


def publish(image_url, text, story_url=None, product_url=None, checkpoints=None, persist=None):
    checkpoints = {} if checkpoints is None else checkpoints
    persist = persist or (lambda: None)
    def once(kind, path, params): return checkpoint_call(checkpoints, kind, persist, path, params)

    if os.environ.get("FB_PAGE_ID") and not product_url: raise ValueError("Facebook requires a product link")
    uid = os.environ["IG_USER_ID"]; out = {}
    urls = image_url if isinstance(image_url, list) else [image_url]
    image_url = urls[0]
    if len(urls) > 10:
        raise ValueError("Instagram carousel supports at most ten colours")
    if len(urls) > 1:
        children = [graph(f"/{uid}/media", {"image_url": url, "is_carousel_item": "true"})["id"] for url in urls]
        for child in children:
            for attempt in range(20):
                status = graph_get(f"/{child}", {"fields": "status_code"}).get("status_code")
                if status == "FINISHED":
                    break
                if status in ("ERROR", "EXPIRED"):
                    raise RuntimeError("Carousel colour processing failed")
                time.sleep(6)
            else:
                raise RuntimeError("Carousel colour processing timed out")
        container = graph(f"/{uid}/media", {"media_type": "CAROUSEL", "children": ",".join(children), "caption": text})["id"]
        for attempt in range(20):
            if graph_get(f"/{container}", {"fields": "status_code"}).get("status_code") == "FINISHED":
                break
            time.sleep(6)
        else:
            raise RuntimeError("Carousel processing timed out")
        out["feed"] = once("feed", f"/{uid}/media_publish", {"creation_id": container})

    for kind, url in (("feed", image_url), ("story", story_url)):
        if not url or kind == "feed" and len(urls) > 1: continue
        params = {"image_url": url} | ({"caption": text} if kind == "feed" else {"media_type": "STORIES"})
        c = graph(f"/{uid}/media", params)["id"]
        for _ in range(20):
            if graph_get(f"/{c}", {"fields": "status_code"}).get("status_code") in ("FINISHED", None): break
            time.sleep(6)
        out[kind] = once(kind, f"/{uid}/media_publish", {"creation_id": c})
    if os.environ.get("FB_PAGE_ID"):
        try: out["facebook"] = once("facebook", f"/{os.environ['FB_PAGE_ID']}/photos", {"url": image_url, "caption": text + f"\n\nShop: {product_url}"})
        except Exception: raise
    return out

def main():
    state = load(STATE, {"posted": {}})
    i = pick(catalogue(), state)
    if not i: print("nothing left to post"); return
    os.makedirs(OUT, exist_ok=True)
    day = lagos_today().isoformat(); base = f"{day}-{re.sub(r'[^A-Za-z0-9-]', '', i['ref'])}"
    photo = fetch_photo(i)
    card(i, photo, 1080, 1350, 900).save(os.path.join(OUT, base + ".jpg"), quality=90)
    card(i, photo, 1080, 1920, 1180).save(os.path.join(OUT, base + "-story.jpg"), quality=90)
    slides = []
    for n, colour in enumerate(style_colours(i)):
        filename = base + f"-colour-{n+1}.jpg"
        card(colour, fetch_photo(colour), 1080, 1350, 900).save(os.path.join(OUT, filename), quality=90)
        slides.append(filename)
    with open(os.path.join(OUT, base + "-slides.json"), "w", encoding="utf-8") as manifest:
        json.dump(slides, manifest)
    text = caption(i); open(os.path.join(OUT, base + ".txt"), "w", encoding="utf-8").write(text)
    print(f"{i['ref']} · {i['model']} · {naira(i['price'])}\n---\n{text}\n---")
    with open(os.environ.get("GITHUB_OUTPUT", os.devnull), "a") as o: o.write(f"base={base}\nref={i['ref']}\n")

def publish_step():
    """Second step: the workflow has committed the images, so Instagram can fetch them from raw.githubusercontent.com."""
    if os.environ.get("IG_POSTING_ENABLED") != "true": raise RuntimeError("Posting disabled until the phone preview is approved")
    base, ref = os.environ["BASE"], os.environ["REF"]
    state = load(STATE, {"posted": {}}); i = next(x for x in grouped_items(catalogue(), active_drop(load(os.path.join(ROOT, "drop.json"), {}), lagos_today())) if x["ref"] == ref)
    text = open(os.path.join(OUT, base + ".txt"), encoding="utf-8").read()
    if text != caption(i): raise RuntimeError("Catalogue changed since rendering; regenerate before posting")
    raw = f"https://raw.githubusercontent.com/{REPO}/{BRANCH}/ig/"
    story_url = raw + base + "-story.jpg" if os.environ.get("IG_AUTO_STORY", "true") != "false" else None
    slides = load(os.path.join(OUT, base + "-slides.json"), [])
    if len(slides) != len(style_colours(i)):
        raise RuntimeError("Colour slides changed; regenerate before posting")
    checkpoints = state.setdefault("checkpoints", {}).setdefault(base, {})
    def persist():
        import subprocess
        json.dump(state, open(STATE, "w"), indent=1)
        relative = os.path.relpath(STATE, ROOT)
        subprocess.run(["git", "add", relative], cwd=ROOT, check=True)
        subprocess.run(["git", "commit", "-m", "Instagram: platform checkpoint"], cwd=ROOT, check=True)
        subprocess.run(["git", "push", "origin", "HEAD:gh-pages"], cwd=ROOT, check=True)
    res = publish([raw + name for name in slides], text, story_url, product_link(ref, "FB"), checkpoints, persist)
    print("published", res)
    day = lagos_today().isoformat()
    record_post(state, i, day)
    state.setdefault("log", []).append({"day": day, "ref": ref, **res}); state["log"] = state["log"][-200:]
    json.dump(state, open(STATE, "w"), indent=1)

if __name__ == "__main__":
    if "--preview-week" in sys.argv:
        from preview_week import generate
        generate()
    elif "--publish" in sys.argv: publish_step()
    else: main()
