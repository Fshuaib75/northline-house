"""Northline photo guard (owner rule, 24-25 Oct 2026: product-only photos, never a female body).

Runs daily on GitHub after Capone's photo refresh (.github/workflows/photo-guard.yml), on a gh-pages checkout:
  1. Collects every photo of every style on sale: the built-in catalogue, products added from the book, and Capone's
     current links (capone.json).
  2. Scores only photos it has not seen before (photo-checked.json keeps every score), with tools/sourcing/vision.py.
  3. A new photo showing a person goes into photo-rules.json and the shop and agent pages never show it.
  4. A style left with no product-only photo is sent to the owner's review inbox (sealed, like every other finding).
     Women's and girls' styles are also hidden straight away (taken out of prices.json, into "hidden"), the way the
     book hides a style; men's and boys' styles stay on sale until the owner decides.

  python tools/photos/guard.py --site . --findings findings.json [--dry]
The workflow seals findings.json into inbox.json with tools/seal-inbox.mjs.
"""
import argparse
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "sourcing"))
import no_people as NP  # noqa: E402

FEMALE = {"Women", "Girl"}
MAX_PHOTOS = 12        # photos per style that are checked (galleries are shorter than this)


def key(u):
    return NP.key(u)


def load(path, default):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return default


def store(site):
    """Every style on sale with the photos the shop would show (before the photo rules are applied)."""
    html = open(os.path.join(site, "shop", "index.html")).read()
    built = json.loads(re.search(r"let ALL = (\[.*?\]);\n", html, re.S).group(1))
    items = {i["ref"]: dict(i) for i in built}
    for a in load(os.path.join(site, "products.json"), []):
        if a.get("ref") and a["ref"] not in items:
            items[a["ref"]] = dict(a)
    cap = load(os.path.join(site, "capone.json"), {}).get("styles", {})
    for ref, r in cap.items():
        if ref in items and r.get("img"):
            items[ref]["imgs"] = list(r["img"])
            items[ref]["img"] = items[ref]["full"] = r["img"][0]    # as the shop's capPhotos does: old links are gone
    prices = load(os.path.join(site, "prices.json"), {})
    on_sale = set(prices.get("prices", {}))
    return [i for ref, i in items.items() if ref in on_sale], prices


def photos_of(i):
    return [u for u in dict.fromkeys([i.get("img"), i.get("full"), *(i.get("imgs") or [])]) if u]


def female(i):
    return i.get("for") in FEMALE or (i.get("g") == "W" and i.get("for") not in ("Men", "Boy"))


def plan(items, checked):
    """Photos not scored yet, grouped per style for the model."""
    todo = []
    for i in items:
        new = [u for u in photos_of(i)[:MAX_PHOTOS] if key(u) not in checked]
        if new:
            todo.append({**i, "imgs": new, "img": new[0]})
    return todo


def decide(items, checked, rules, limit=NP.PERSON_LIMIT):
    """Returns (rules, hide, notices). Pure: tested in tools/tests/test_photo_guard.py."""
    allowed = set(rules.get("allowed", []))            # checked by eye as product-only: never blocked
    blocked = set(rules.get("photos", []))
    blocked |= {k for k, s in checked.items() if s is not None and s >= limit}
    blocked -= allowed
    best = dict(rules.get("best", {}))
    hide, notices = [], []
    for i in items:
        mine = photos_of(i)
        if not mine:
            continue
        clean = [u for u in mine if key(u) not in blocked]
        known = [u for u in mine if key(u) in checked or key(u) in blocked]
        if clean or len(known) < len(mine):
            continue                                   # has a product-only photo, or not fully checked yet
        if i["ref"] in rules.get("keep", []) or i["ref"] in rules.get("reported", []):
            continue                                   # owner already decided, or already in the review inbox
        why = ("Every photo of this style shows a female body, so the photo guard has hidden it from the shop. "
               "Approve to confirm. To bring it back later, unhide it in the book once it has a product-only photo.") if female(i) else \
              ("Every photo of this style shows a person (men's or boys'). It is still on sale. "
               "Approve to hide it, or reject to keep it as it is.")
        (hide if female(i) else []).append(i["ref"])
        notices.append({"t": "gone", "ref": i["ref"], "why": why, "page": i.get("page", "")})
    out = {**rules, "photos": sorted(blocked), "best": best,
           "reported": sorted(set(rules.get("reported", [])) | {n["ref"] for n in notices})}
    return out, hide, notices


def hide_in_prices(prices, refs):
    for r in refs:
        prices.get("prices", {}).pop(r, None)
        if isinstance(prices.get("next"), dict):
            prices["next"].pop(r, None)
        prices.setdefault("hidden", [])
        if r not in prices["hidden"]:
            prices["hidden"].append(r)
    return prices


def reachable(url, timeout=15):
    """True if the photo downloads as an image (first bytes only)."""
    import urllib.request
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Northline photo guard)", "Range": "bytes=0-2047"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            ctype = r.headers.get("Content-Type", "")
            return r.status in (200, 206) and (ctype.startswith("image/") or not ctype) and bool(r.read(64))
    except Exception:
        return False


def clean_photos(i, blocked):
    return [u for u in photos_of(i) if key(u) not in blocked]


def health(items, checked, rules, state, today, fetch, scored_today=()):
    """Gaps 1 and 2 (owner, 25 Oct): styles whose product-only photos no longer load ("blank"), and styles with
    photos the guard could not download to check ("unchecked"). Each must be seen on two runs in a row, then goes to
    the review inbox once; it can be reported again only after it recovers. Pure apart from `fetch(url) -> bool`."""
    blocked = set(rules.get("photos", [])) - set(rules.get("allowed", []))
    state = {"blank": dict(state.get("blank", {})), "unchecked": dict(state.get("unchecked", {})),
             "reported": {"blank": list(state.get("reported", {}).get("blank", [])),
                          "unchecked": list(state.get("reported", {}).get("unchecked", []))}}
    now = {"blank": set(), "unchecked": set()}
    for i in items:
        clean = clean_photos(i, blocked)
        if not clean:
            continue                                   # no clean photo: handled by decide() (hidden or reported)
        if not any(fetch(u) for u in clean[:4]):
            now["blank"].add(i["ref"])
        elif any(key(u) not in checked for u in clean[:MAX_PHOTOS]):
            now["unchecked"].add(i["ref"])
    notices = []
    for kind in ("blank", "unchecked"):
        seen, done = state[kind], state["reported"][kind]
        for ref in list(seen):
            if ref not in now[kind]:
                del seen[ref]                          # recovered
                if ref in done:
                    done.remove(ref)
        for ref in now[kind]:
            if ref not in seen:
                seen[ref] = today                      # first time: wait for a second run
            elif seen[ref] < today and ref not in done:
                done.append(ref)
                i = next(x for x in items if x["ref"] == ref)
                label = f"{i.get('brand', '')} {i.get('model', '')} · {i.get('colour', '')}".strip()
                why = (f"{label}: its photos have not loaded since {seen[ref]}, so customers see a blank card. The "
                       "supplier probably changed the photo links. Approve to hide it, or reject and update its photos.") \
                    if kind == "blank" else \
                      (f"{label}: some of its photos could not be downloaded to check for people since {seen[ref]} "
                       "(the supplier may block the checker). They are still showing. Approve to hide it until they are "
                       "checked, or reject to keep it and check the photos yourself.")
                notices.append({"t": "gone", "ref": ref, "why": why, "page": i.get("page", "")})
    for kind in ("blank", "unchecked"):
        state["reported"][kind] = sorted(state["reported"][kind])
    return state, notices


def main(argv=None):
    a = argparse.ArgumentParser()
    a.add_argument("--site", required=True)
    a.add_argument("--findings", required=True)
    a.add_argument("--dry", action="store_true")
    args = a.parse_args(argv)
    site = args.site
    checked = load(os.path.join(site, "photo-checked.json"), {}).get("scores", {})
    rules = load(os.path.join(site, "photo-rules.json"), {"photos": [], "best": {}})
    for k in rules.get("photos", []):
        checked.setdefault(k, 1.0)                      # blocked by an earlier check: never score again
    items, prices = store(site)
    todo = plan(items, checked)
    print(f"{len(items)} styles on sale, {sum(len(photos_of(i)) for i in todo)} new photos to check", flush=True)
    if todo:
        import vision
        results, _, requested, failed = vision.score_items(todo, limit_imgs=MAX_PHOTOS)
        for r in results:
            for p in r["photos"]:
                checked[key(p["url"])] = round(p["person"], 3)
        print(f"checked {requested - failed} of {requested} new photos", flush=True)
    new_rules, hide, notices = decide(items, checked, rules)
    added = len(new_rules["photos"]) - len(rules.get("photos", []))
    changed = added or notices
    import datetime
    from concurrent.futures import ThreadPoolExecutor
    today = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    on_sale = [i for i in items if i["ref"] not in hide]
    urls = sorted({u for i in on_sale for u in clean_photos(i, set(new_rules["photos"]))[:4]})
    with ThreadPoolExecutor(16) as ex:
        ok = dict(zip(urls, ex.map(reachable, urls)))
    state_path = os.path.join(site, "photo-health.json")
    state, more = health(on_sale, checked, new_rules, load(state_path, {}), today, lambda u: ok.get(u, False))
    notices += more
    print(f"{added} newly blocked photos, {len(hide)} styles hidden, {len(notices)} sent to the review inbox; "
          f"photos not loading: {len(state['blank'])} styles, not yet checkable: {len(state['unchecked'])} styles")
    with open(args.findings, "w") as f:
        json.dump({"source": "Photo guard (product-only photos)", "items": notices}, f)
    if args.dry:
        return
    with open(os.path.join(site, "photo-checked.json"), "w") as f:
        json.dump({"note": "Person score of every store photo already checked (tools/photos/guard.py). 0 = product only. "
                           "Photos checked by eye as product-only are 0 and listed under \"allowed\" in photo-rules.json.",
                   "scores": dict(sorted(checked.items()))}, f, separators=(",", ":"))
    with open(state_path, "w") as f:
        json.dump({"note": "Styles whose photos don't load (blank) or couldn't be checked, since when, and which were "
                           "sent to the review inbox (tools/photos/guard.py).", **state}, f, indent=1)
    if changed:
        NP.RULES = new_rules
        with open(os.path.join(site, "photo-rules.json"), "w") as f:
            json.dump(new_rules, f, indent=1)
        for page in ("shop/index.html", "index.html"):
            p = os.path.join(site, page)
            with open(p) as f:
                html = f.read()
            with open(p, "w") as f:
                f.write(NP.inject(html))
    if hide:
        raw = open(os.path.join(site, "prices.json")).read()
        out = json.dumps(hide_in_prices(prices, hide), ensure_ascii=False, separators=(",", ":"))
        with open(os.path.join(site, "prices.json"), "w") as f:
            f.write(out + ("\n" if raw.endswith("\n") else ""))


if __name__ == "__main__":
    main()
