"""Capone weekly check. Runs on GitHub's servers every Monday (see .github/workflows/capone-check.yml).

Reads Capone's public product list and, for every Capone style in the catalogue, finds:
  - whether Capone still lists that colour,
  - its current photo links (Capone re-uploads photos under new file names, which breaks the old links),
  - which sizes are in stock on Capone's site.
Writes capone.json, whose photo links the shop and agent page use, and a plain report. The report goes to a
GitHub issue ("Capone weekly check"), with a comment, and so an email, when something changed since last week.

  python tools/capone/check.py           run in the gh-pages checkout: writes capone.json and posts the report
  python tools/capone/check.py --dry     prints the report only (development runs)
"""
import collections, datetime, json, os, re, sys, time, urllib.error, urllib.request

STORE = "https://www.caponeoutfitters.com.tr"
CDN = "https://cdn.shopify.com/s/files/1/0566/3732/5374/files/"
UA = "Mozilla/5.0 (compatible; NorthlineCatalogueCheck/1.0)"
DRY = "--dry" in sys.argv
ISSUE_TITLE = "Capone weekly check"
LABEL = "capone-check"


def get(url, tries=4, data=None, headers=None, method=None):
    for n in range(tries):
        try:
            req = urllib.request.Request(url, data=data, method=method, headers={"User-Agent": UA, "Accept": "application/json", **(headers or {})})
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                time.sleep(5 * (n + 1)); continue
            return e.code, e.read()
        except Exception as e:
            print("  fetch error", url, e); time.sleep(5 * (n + 1))
    return 0, b""


def store_products():
    out = []
    for page in range(1, 60):
        st, body = get(f"{STORE}/products.json?limit=250&page={page}")
        if st != 200:
            sys.exit(f"Capone's product list didn't load (page {page}, status {st}). Nothing was changed.")
        items = json.loads(body).get("products", [])
        if not items:
            break
        out += items
        time.sleep(1.5)                          # be gentle with Capone's site
    return out


# photo file names: <article>_<colour code>_<photo number>[_<upload id>].jpg, e.g. 530-K795-FDG-01-0000_K444_2_799d….jpg
NAME = re.compile(r"^(?P<stem>.*_[A-Z]+\d+)_(?P<n>\d+)(?:_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?\.\w+$")
def fname(u): return u.split("?")[0].rsplit("/", 1)[-1]
def parts(u):
    m = NAME.match(fname(u)); return (m.group("stem"), int(m.group("n"))) if m else (None, None)
def width(u, w): return CDN + fname(u) + f"?width={w}"


def catalogue():
    html = open("shop/index.html", encoding="utf-8").read()
    ALL = json.loads(re.search(r"let ALL = (\[.*?\]);\n", html, re.S).group(1))
    try: added = json.load(open("products.json"))
    except Exception: added = []
    known = {i["ref"] for i in ALL}
    items = ALL + [a for a in added if a.get("ref") and a["ref"] not in known]
    P = json.load(open("prices.json"))
    return [i for i in items if i.get("brand") == "Capone"], P


def colour_variants(q, stem, srcs):
    """The product's variants for this colour: by SKU (article + colour code + size), else by the photos' variant ids."""
    art, col = stem.rsplit("_", 1)
    vs = [v for v in q.get("variants", []) if (v.get("sku") or "").replace("-", "").startswith((art + col).replace("-", ""))]
    if vs: return vs
    ids = {vid for im in q.get("images", []) if im["src"] in srcs for vid in im.get("variant_ids", [])}
    vs = [v for v in q.get("variants", []) if v["id"] in ids]
    if vs: return vs
    colours = next((o["values"] for o in q.get("options", []) if o.get("name") == "Renk"), [])
    return q.get("variants", []) if len(colours) <= 1 else []


def size_of(q, v):
    names = [o.get("name") for o in q.get("options", [])]
    k = names.index("Beden") + 1 if "Beden" in names else None
    return str(v.get(f"option{k}")) if k else "One size"


def check(cap, P, prods):
    by_stem = collections.defaultdict(list)            # stem -> [(product, src)] in the store's photo order
    for q in prods:
        for im in sorted(q.get("images", []), key=lambda x: x.get("position", 0)):
            s, _ = parts(im["src"])
            if s: by_stem[s].append((q, im["src"]))
    out = {}
    for i in cap:
        mine = [u for u in [i.get("img")] + (i.get("imgs") or []) if u]
        stems = [parts(u)[0] for u in mine if parts(u)[0]]
        if not stems:
            continue                                     # photos not from Capone's Shopify store: can't check
        stem = stems[0]
        hits = by_stem.get(stem)
        if not hits:
            out[i["ref"]] = {"on": 0}
            continue
        q = hits[0][0]
        srcs = list(dict.fromkeys(s for p, s in hits if p is q))
        order = []                                        # keep our photo order (the card photo first)
        for u in mine:
            s, n = parts(u)
            if s == stem and n not in order: order.append(n)
        srcs.sort(key=lambda s: order.index(parts(s)[1]) if parts(s)[1] in order else len(order))
        vs = colour_variants(q, stem, set(srcs))
        rec = {"on": 1, "img": [width(s, 1200) for s in srcs[:8]]}
        if vs:
            rec["stock"] = sorted({size_of(q, v) for v in vs if v.get("available")}, key=lambda x: (len(x), x))
        out[i["ref"]] = rec
    return out


def label(i): return f"{i['model']} · {i.get('colour') or ''}".strip(" ·")


def report(cap, P, res, prev, when):
    hidden = set(P.get("hidden", [])); prices = P.get("prices", {})
    inshop = [i for i in cap if i["ref"] in prices and i["ref"] not in hidden]
    hid = [i for i in cap if i["ref"] in hidden]
    r = lambda i: res.get(i["ref"])
    gone = [i for i in inshop if r(i) and not r(i)["on"]]
    sold = [i for i in inshop if r(i) and r(i)["on"] and r(i).get("stock") == []]
    back = [i for i in hid if r(i) and r(i)["on"] and r(i).get("stock")]
    unknown = [i for i in inshop if not r(i)]
    newfoto = [i for i in inshop if r(i) and r(i)["on"] and fname(r(i)["img"][0]) != fname(i.get("img") or "")]
    def was(i, k):
        p = (prev.get("styles") or {}).get(i["ref"])
        return p is not None and (k(p))
    news = []
    if prev.get("styles"):
        ns = [i for i in sold if not was(i, lambda p: p.get("on") and p.get("stock") == [])]
        ng = [i for i in gone if not was(i, lambda p: not p.get("on"))]
        nb = [i for i in inshop + hid if r(i) and r(i).get("stock") and was(i, lambda p: p.get("stock") == [] or not p.get("on"))]
        if ns: news.append(f"**{len(ns)} newly sold out:** " + ", ".join(f"{i['ref']} ({label(i)})" for i in ns))
        if ng: news.append(f"**{len(ng)} no longer on Capone's site:** " + ", ".join(f"{i['ref']} ({label(i)})" for i in ng))
        if nb: news.append(f"**{len(nb)} back in stock:** " + ", ".join(f"{i['ref']} ({label(i)})" for i in nb))
    lines = lambda xs: "\n".join(f"- `{i['ref']}` {label(i)}" for i in sorted(xs, key=lambda i: (i["model"], i.get("colour") or ""))) or "- none"
    body = f"""Checked {when:%d %b %Y, %H:%M} UTC against Capone's website ({len(cap)} Capone styles in the catalogue).

| | Styles |
|---|---:|
| In your shop | {len(inshop)} |
| … sold out in every size at Capone | {len(sold)} |
| … no longer on Capone's site | {len(gone)} |
| … photos refreshed (Capone uploaded new ones) | {len(newfoto)} |
| Hidden, but in stock at Capone again | {len(back)} |

The shop and agent page use the new photo links automatically, and sizes Capone has sold out can't be ordered
(a style with nothing left shows "Sold out"). Hiding or showing styles is still up to you, in your book.

### Sold out in every size at Capone, still in your shop ({len(sold)})
These show "Sold out" and can't be ordered until Capone restocks. Hide them in your book if they won't come back.
{lines(sold)}

### No longer on Capone's site, still in your shop ({len(gone)})
{lines(gone)}

### Hidden in your shop, in stock at Capone again ({len(back)})
In your book, tap *Show to agents* on the ones you want back.
{lines(back)}
""" + (f"\n### Couldn't be checked ({len(unknown)})\nTheir photos aren't from Capone's own store.\n{lines(unknown)}\n" if unknown else "")
    summary = f"{len(inshop)} in the shop: {len(sold)} sold out at Capone, {len(gone)} no longer listed, {len(back)} hidden ones back in stock."
    return body, news, summary


def github(method, path, payload=None):
    tok, repo = os.environ.get("GITHUB_TOKEN"), os.environ.get("GITHUB_REPOSITORY")
    st, body = get(f"https://api.github.com/repos/{repo}{path}", tries=2, method=method,
                   data=json.dumps(payload).encode() if payload is not None else None,
                   headers={"Authorization": f"Bearer {tok}", "Accept": "application/vnd.github+json", "Content-Type": "application/json"})
    if st >= 300 or st == 0: print("GitHub", method, path, st, body[:300]); return None
    return json.loads(body or b"null")


def post(body, news, summary, first):
    found = github("GET", f"/issues?state=open&labels={LABEL}&per_page=5") or []
    issue = next((x for x in found if x.get("title") == ISSUE_TITLE), None)
    if issue:
        github("PATCH", f"/issues/{issue['number']}", {"body": body})
    else:
        issue = github("POST", "/issues", {"title": ISSUE_TITLE, "body": body, "labels": [LABEL]})
    if issue and news and not first:
        github("POST", f"/issues/{issue['number']}/comments", {"body": "Since last week:\n\n" + "\n\n".join(news) + f"\n\n{summary}"})


def main():
    cap, P = catalogue()
    prods = store_products()
    if len(prods) < 1000:
        sys.exit(f"Capone's product list looks wrong ({len(prods)} products). Nothing was changed.")
    res = check(cap, P, prods)
    checkable = [i for i in cap if i["ref"] in res]
    listed = sum(1 for i in checkable if res[i["ref"]]["on"])
    if checkable and listed < len(checkable) / 2:
        sys.exit(f"Only {listed} of {len(checkable)} styles matched Capone's site: its photo names may have changed. Nothing was changed.")
    try: prev = json.load(open("capone.json"))
    except Exception: prev = {}
    when = datetime.datetime.now(datetime.timezone.utc)
    body, news, summary = report(cap, P, res, prev, when)
    print(summary); print(); print(body)
    if news: print("\n".join(news))
    if DRY:
        st = collections.Counter(("listed" if v["on"] else "gone", "stock unknown" if v["on"] and "stock" not in v else "") for v in res.values())
        print("\n[dry run] nothing written.", dict(st))
        unk = [i["ref"] for i in cap if res.get(i["ref"], {}).get("on") and "stock" not in res[i["ref"]]][:6]
        if unk:
            idx = collections.defaultdict(list)
            for q in prods:
                for im in q.get("images", []):
                    s, _ = parts(im["src"])
                    if s: idx[s].append(q)
            for ref in unk:
                i = next(x for x in cap if x["ref"] == ref); s = parts(i["img"])[0]; q = idx[s][0]
                print("  stock unknown:", ref, s, "| options", q.get("options"), "| skus", [v.get("sku") for v in q["variants"][:4]])
        return
    json.dump({"checked": when.strftime("%Y-%m-%dT%H:%MZ"), "styles": res}, open("capone.json", "w"), separators=(",", ":"))
    post(body, news, summary, first=not prev.get("styles"))


if __name__ == "__main__":
    main()
