"""Public, noindex editorial preview. No Graph API calls and no posting-state writes."""
import copy
import datetime as dt
import html
import json
import os
from pathlib import Path
from PIL import Image, ImageDraw
import autopost as A

PIN_COPY = [
    ("how-to-order", "How to order", ["Pick on northlinehouse.shop", "Send your order on WhatsApp", "We confirm your size", "Pay by bank transfer", "Delivered within 14 days of payment"],
     "Pick your pieces on northlinehouse.shop → send your order on WhatsApp → we confirm your size → pay by bank transfer → delivered within 14 days of payment. We confirm availability before you pay. #northlinehouse"),
    ("delivery-payment", "Delivery & payment", ["Prices include shipping to Nigeria", "Delivery from our Abuja pickup point is paid on delivery", "Bank transfer only after we confirm", "No size exchanges"],
     "Prices include shipping to Nigeria. Delivery from our Abuja pickup point to your address is paid to the courier on delivery. Bank transfer only after we confirm availability and your size. No size exchanges. Order on northlinehouse.shop. #northlinehouse"),
]

def plan(items, state, drop, start, render):
    """Run the real picker seven times, advancing only our copied, successfully rendered history."""
    simulated = copy.deepcopy(state)
    simulated.setdefault("posted", {})
    days = []
    for offset in range(7):
        date = start + dt.timedelta(days=offset)
        item = A.pick(items, simulated, today=date, drop=drop)
        row = {"day": date.isoformat(), "ready": False}
        if item:
            row.update(ref=item["ref"], name=item["model"], price=item["price"], caption=A.caption(item),
                       story_link=A.product_link(item["ref"], "IG"), facebook_link=A.product_link(item["ref"], "FB"))
            try:
                row.update(render(item, date))
                row["ready"] = True
                simulated["posted"][item["ref"]] = date.isoformat()
                simulated["last_aud"] = A.audience(item)
            except Exception:
                row["warning"] = "Photo/render failed. Nothing will post from this preview; the picker will retry this style."
        else:
            row["warning"] = "No eligible style available. No duplicate or replacement has been invented."
        days.append(row)
    return days

def base_pin(title):
    im = Image.new("RGB", (1080, 1350), A.BG)
    A.logo(im, 64, 64, 48)
    d = ImageDraw.Draw(im)
    d.text((64, 142), "Considered everyday essentials.", font=A.font("Jost.ttf", 27), fill=A.MUTED)
    d.text((64, 235), title, font=A.font("Newsreader.ttf", 76), fill=A.INK)
    d.line((64, 365, 1016, 365), fill=A.CREAM2, width=2)
    d.text((64, 1278), "northlinehouse.shop", font=A.font("Jost.ttf", 29), fill=A.MUTED)
    return im

def text_pin(title, lines):
    im = base_pin(title)
    d = ImageDraw.Draw(im)
    for n, line in enumerate(lines):
        y = 435 + n * (140 if len(lines) == 5 else 175)
        d.text((64, y), f"0{n + 1}", font=A.font("Jost.ttf", 29), fill=A.MUTED)
        for j, text in enumerate(A.wrap(d, line, A.font("Jost.ttf", 39), 850)):
            d.text((144, y + j * 52), text, font=A.font("Jost.ttf", 39), fill=A.INK)
    return im

def drop_pin(items, photos, page, total):
    im = base_pin("This week’s drop")
    d = ImageDraw.Draw(im)
    # Six styles per image; a larger drop becomes one carousel post rather than unreadable miniatures.
    d.rectangle((60, 365, 1020, 1240), fill=A.BG)
    if not items:
        d.text((64, 520), "No current drop styles eligible.", font=A.font("Jost.ttf", 38), fill=A.MUTED)
    for n, item in enumerate(items):
        x, y = 64 + (n % 2) * 496, 390 + (n // 2) * 285
        photo = photos.get(item["ref"])
        if photo is not None:
            im.paste(A.photo_box(photo, 452, 180), (x, y))
        else:
            d.text((x + 20, y + 70), "Photo unavailable", font=A.font("Jost.ttf", 26), fill=A.MUTED)
        name = item["model"] + (" · " + item["colour"] if item.get("colour") else "")
        for j, line in enumerate(A.wrap(d, name, A.font("Jost.ttf", 25), 452)[:2]):
            d.text((x, y + 190 + j * 30), line, font=A.font("Jost.ttf", 25), fill=A.INK)
        A.draw_price(d, x, y + 278, item["price"], 34)
    d.text((1016, 1285), f"{page}/{total}", font=A.font("Jost.ttf", 26), fill=A.MUTED, anchor="rs")
    return im

def write_page(out, days, pins, generated):
    esc = lambda s: html.escape(str(s), quote=True)
    def copy_block(label, value):
        return f'<label>{esc(label)}<textarea readonly>{esc(value)}</textarea></label><button type="button" class="copy">Copy {esc(label.lower())}</button>'
    def asset(url, label):
        return f'<figure><a href="{esc(url)}" download><img loading="lazy" src="{esc(url)}" alt="{esc(label)}"></a><figcaption><a href="{esc(url)}" download>Download {esc(label)}</a></figcaption></figure>'
    content = []
    for row in days:
        content.append(f'<article><h2>{esc(row["day"])} · {esc(row.get("name", "No post"))}</h2>')
        if row["ready"]:
            content.append('<div class="pair">' + asset(row["feed"], "feed · 1080×1350") + asset(row["story"], "story · 1080×1920") + '</div>')
        else:
            content.append(f'<p class="warning">{esc(row["warning"])}</p>')
        if row.get("ref"):
            content.append(f'<p>{esc(row["ref"])} · {esc(A.naira(row["price"]))}</p>')
            content.append(copy_block("Caption", row["caption"]))
            content.append(copy_block("Instagram story link", row["story_link"]))
            content.append(f'<p>For a link sticker, upload the downloaded story manually with this link before publishing. The API does not add stickers. <a href="{esc(row["story_link"])}">Check product</a> · <a href="{esc(row["facebook_link"])}">Facebook product link</a></p>')
        content.append('</article>')
    content.append('<h2 id="pins">Three pinned posts · manual upload</h2><p>These are prepared assets, not scheduled or pinned by this robot. A large drop uses carousel pages.</p>')
    for pin in pins:
        content.append(f'<article><h2>{esc(pin["title"])}</h2>')
        if not pin["ready"]: content.append('<p class="warning">Not ready to post: no eligible drop or a product photo is missing.</p>')
        content.extend(asset(image, "pinned image · 1080×1350") for image in pin["images"])
        content.append(copy_block("Caption", pin["caption"]) + '</article>')
    ready = sum(r["ready"] for r in days)
    page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>Northline · Instagram preview</title>
<style>*{box-sizing:border-box}body{margin:0;background:#F4F0E8;color:#2E2C29;font:16px/1.5 system-ui,sans-serif}main{max-width:1000px;padding:24px 16px;margin:auto}article{background:#FBF8F2;border:1px solid #E2D9CA;border-radius:14px;padding:18px;margin:22px 0}h1,h2{line-height:1.2}h2{font-size:22px;overflow-wrap:anywhere}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0 0 18px}img{display:block;width:100%;height:auto;max-width:540px}textarea{display:block;width:100%;min-height:125px;font:inherit;padding:10px;border:1px solid #E2D9CA;background:#fff;color:#2E2C29}button,.action{font:inherit;border:0;background:#2E2C29;color:#fff;padding:11px 16px;border-radius:8px;display:inline-block;margin:10px 0 20px;text-decoration:none}a{color:#4A3426;overflow-wrap:anywhere}.warning{padding:14px;background:#eee3d0;font-weight:600}.copy{cursor:pointer}label{display:block}#status{min-height:24px}@media(max-width:600px){.pair{grid-template-columns:1fr}article{padding:12px}}</style><main>'''
    page += f'<h1>Next 7 auto-posts</h1><p>Snapshot: {esc(generated)} · Lagos dates · {ready}/7 ready</p><p>Preview only. No posts sent, and posting history is unchanged. This forecast assumes successful posts and unchanged stock, drop and prices; regenerate after edits.</p><p><a href="#pins">Pinned posts</a></p><a class="action" href="https://github.com/Fshuaib75/northline-house/actions/workflows/ig-autopost.yml">Preview next 7 days</a><p>Choose “Preview next 7 days”, then Run workflow. Claude checks this page on a phone before posting is enabled.</p><p id="status" role="status"></p>'
    page += ''.join(content) + '''</main><script>document.querySelectorAll('.copy').forEach(b=>b.onclick=async()=>{const t=b.previousElementSibling.querySelector('textarea');try{await navigator.clipboard.writeText(t.value);document.getElementById('status').textContent='Copied.';}catch(e){t.focus();t.select();document.getElementById('status').textContent='Select and copy the highlighted text.';}});</script></html>'''
    (out / "index.html").write_text(page, encoding="utf-8")

def generate(items=None, state=None, drop=None, start=None, out=None):
    items = A.catalogue() if items is None else items
    state = A.load(A.STATE, {"posted": {}}) if state is None else state
    drop = A.load(os.path.join(A.ROOT, "drop.json"), {}) if drop is None else drop
    start = start or A.next_post_day()
    out = Path(out or os.path.join(A.ROOT, "ig-preview"))
    out.mkdir(parents=True, exist_ok=True)
    # Only generated assets in this directory are replaced; posting history is never touched.
    for file in out.glob("*.jpg"): file.unlink()
    photos, failed_photos = {}, set()
    def photo(item):
        if item["ref"] in failed_photos: raise RuntimeError("Photo unavailable in this snapshot")
        if item["ref"] not in photos:
            try: photos[item["ref"]] = A.fetch_photo(item)
            except Exception:
                failed_photos.add(item["ref"])
                raise
        return photos[item["ref"]]
    def render(item, day):
        base = day.isoformat()
        A.card(item, photo(item), 1080, 1350, 1000).save(out / (base + ".jpg"), quality=90)
        A.card(item, photo(item), 1080, 1920, 1180).save(out / (base + "-story.jpg"), quality=90)
        return {"feed": base + ".jpg", "story": base + "-story.jpg"}
    days = plan(items, state, drop, start, render)
    pins = []
    for slug, title, lines, caption in PIN_COPY:
        name = "pin-" + slug + ".jpg"
        text_pin(title, lines).save(out / name, quality=92)
        pins.append({"title": title, "caption": caption, "images": [name], "ready": True})
    drop = A.active_drop(drop, A.lagos_today())
    by_ref = {i["ref"]: i for i in A.eligible_items(items, drop)}
    current = [by_ref[r] for r in dict.fromkeys(drop.get("refs", [])) if r in by_ref]
    missing = False
    for item in current:
        try: photo(item)
        except Exception: missing = True
    chunks = [current[n:n+6] for n in range(0, len(current), 6)] or [[]]
    assets = []
    for n, chunk in enumerate(chunks):
        name = f"pin-drop-{n+1}.jpg"
        drop_pin(chunk, photos, n+1, len(chunks)).save(out / name, quality=92)
        assets.append(name)
    caption = (f"This week’s drop · {len(current)} styles. " if current else "No current drop styles eligible. ") + "Prices shown include shipping to Nigeria. Delivery from our Abuja pickup point is paid on delivery. Choose on northlinehouse.shop; we confirm availability and your size before bank transfer. No size exchanges. #northlinehouse"
    pins.append({"title": "This week’s drop", "caption": caption, "images": assets, "ready": bool(current) and not missing})
    generated_at = dt.datetime.now(dt.timezone.utc).isoformat()
    write_page(out, days, pins, generated_at + " · First scheduled day: " + start.isoformat())
    (out / "plan.json").write_text(json.dumps({"generated": start.isoformat(), "generated_at": generated_at, "days": days, "pins": pins}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Preview: {sum(r['ready'] for r in days)}/7 daily posts ready; 3 pinned post sets. No social posts sent.")
    return {"days": days, "pins": pins}
