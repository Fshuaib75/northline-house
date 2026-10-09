"""Other brands weekly check. Runs on GitHub's servers every Monday (see .github/workflows/brands-check.yml).

The Capone check (tools/capone) covers Capone. This one covers the other brands whose own websites show stock per size:
  - T-Soft shops: Slazenger, Ziya, Tergan
  - Qukasoft shop: Sivarro
  - Shopify shop: Aldo
For each style it finds the brand's product page (once; the link is remembered), reads which sizes are in stock, and
writes brands.json in the same shape as capone.json, so the shop and agent page block sold-out sizes, hide models sold
out in every colour and show "Back in stock" badges for these brands too. The report goes to the GitHub issue
"Other brands weekly check".

Brands not covered yet (their sites need their own reader): DESA, Elle, Bambi (Ticimax), the n11 marketplace brands,
DeFacto, LC Waikiki. Their styles are simply not in brands.json, which the pages treat as "assume available".

  python tools/brands/check.py           run in the gh-pages checkout: writes brands.json and posts the report
  python tools/brands/check.py --dry     prints the report only (development runs)
"""
import collections, datetime, gzip, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

UA = "Mozilla/5.0 (compatible; NorthlineCatalogueCheck/1.0)"
DRY = "--dry" in sys.argv
ISSUE_TITLE = "Other brands weekly check"
LABEL = "brands-check"
BACK_DAYS = 14
SIZES = {"W": ["36", "37", "38", "39", "40", "41"], "M": ["40", "41", "42", "43", "44", "45"]}
SITES = {   # brand -> (platform, shop address)
    "Slazenger": ("tsoft", "https://www.slazenger.com.tr"),
    "Ziya": ("tsoft", "https://www.ziya.com.tr"),
    "Tergan": ("tsoft", "https://www.tergan.com.tr"),
    "Sivarro": ("qukasoft", "https://www.sivarro.com"),
    "Aldo": ("shopify", "https://www.aldoshoes.com.tr"),
}
FETCHES = 0


def get(url, tries=3):
    """(status, text). Gentle: one request every 1.2 s per run."""
    global FETCHES
    for n in range(tries):
        try:
            FETCHES += 1; time.sleep(1.2)
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/json,*/*",
                                                       "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8", "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=40) as r:
                body = r.read()
                if r.headers.get("Content-Encoding") == "gzip": body = gzip.decompress(body)
                return r.status, body.decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504, 520, 522, 524) and n < tries - 1:
                time.sleep(6 * (n + 1)); continue
            return e.code, ""
        except Exception as e:
            print("  fetch error", url, e); time.sleep(6 * (n + 1))
    return 0, ""


def catalogue():
    html = open("shop/index.html", encoding="utf-8").read()
    ALL = json.loads(re.search(r"let ALL = (\[.*?\]);\n", html, re.S).group(1))
    try: added = json.load(open("products.json"))
    except Exception: added = []
    known = {i["ref"] for i in ALL}
    items = ALL + [a for a in added if a.get("ref") and a["ref"] not in known]
    P = json.load(open("prices.json"))
    return [i for i in items if i.get("brand") in SITES and i["ref"] in P.get("prices", {})], P


def sizes_of(i):
    return i.get("sizes") or SIZES.get(i.get("g"), ["One size"])


def photos(i):
    return [u for u in [i.get("img")] + (i.get("imgs") or []) + [i.get("full")] if u]


def fname(u): return urllib.parse.unquote(u.split("?")[0].rsplit("/", 1)[-1])


SIZE_RE = re.compile(r"^\d{2}(?:[.,]5)?$")


def norm_size(s):
    s = str(s).strip().replace(",", ".")
    m = re.search(r"\b(\d{2}(?:\.5)?)\b", s)
    return m.group(1) if m else s


# ---------------------------------------------------------------- T-Soft (Slazenger, Ziya, Tergan)
def tsoft_stock(page):
    """Sizes in stock from a T-Soft product page, or None if the page has no stock data.
    variant_stocks keys are "<colour id>_<size id>" (or just "<size id>"); the size labels are the <p> inside the
    page's variant buttons. A page showing several colours uses the selected one."""
    m = re.search(r'"variant_stocks":(\{[^}]*\})', page)
    if not m: return None
    stocks = json.loads(m.group(1))
    labels = {a: norm_size(b) for a, b in re.findall(r'<a[^>]*\bdata-id="(\d+)"[^>]*>\s*<p>([^<]+)</p>', page)}
    is_size = lambda x: bool(SIZE_RE.match(labels.get(x, "")))
    colours = {p for k in stocks for p in k.split("_") if not is_size(p)}
    sel = re.search(r'subOne.*?<a[^>]*data-id="(\d+)"[^>]*class="[^"]*\bselected', page, re.S)
    keep = {sel.group(1)} if (sel and len(colours) > 1) else colours
    out = set()
    for key, n in stocks.items():
        parts = key.split("_")
        size = next((x for x in parts if is_size(x)), None)
        if size is None or any(x not in keep for x in parts if x != size): continue
        try:
            if float(n) > 0: out.add(labels[size])
        except ValueError:
            pass
    return sorted(out)


def tsoft_find(i, base):
    """The style's product page: Slazenger by search on its article code, the others from the photo's file name."""
    ids = [m.group(1) for u in photos(i) for m in [re.search(r"-(\d{4,})-\d+-[A-Z]\.\w+$", fname(u))] if m]
    def is_mine(page): return any(f"-{x}-" in page for x in ids) and '"variant_stocks"' in page
    if i["brand"] == "Slazenger":
        code = i["ref"].split("-", 1)[1]                     # SLZ-SA16SE030-500 -> SA16SE030-500
        st, page = get(f"{base}/arama?q={urllib.parse.quote(code.rsplit('-', 1)[0])}")
        for raw in re.findall(r"PRODUCT_DATA\.push\(JSON\.parse\('(.*?)'\)\);", page):
            try: d = json.loads(raw.encode().decode("unicode_escape"))
            except Exception: continue
            if str(d.get("code", "")).upper() == code.upper():
                url = f"{base}/{d['url']}"; st, p = get(url)
                if st == 200 and '"variant_stocks"' in p: return url, p
    for u in photos(i):
        stem = re.sub(r"-\d+-\d+-[A-Z]\.\w+$", "", fname(u))
        if stem == fname(u): continue
        tok = stem.split("-")
        for k in range(1, min(7, len(tok))):
            url = f"{base}/{'-'.join(tok[:len(tok) - k])}"
            st, page = get(url)
            if st == 200 and is_mine(page): return url, page
        break
    return None, None


# ---------------------------------------------------------------- Qukasoft (Sivarro)
def quka_stock(page):
    k = page.find("variants:")
    if k < 0: return None
    try: v, _ = json.JSONDecoder().raw_decode(page[k + len("variants:"):].lstrip())
    except Exception: return None
    out = set()
    for name, rec in (v.get("summary") or {}).items():
        if isinstance(rec, dict) and rec.get("in_stock"):
            s = norm_size(re.split(r"[-/ ]", str(name))[-1])
            if SIZE_RE.match(s): out.add(s)
    return sorted(out)


QUKA_CACHE = {}
def quka_find(i, base):
    """Search the model name, then open results until one shows this style's photo."""
    toks = [re.search(r"/p/([0-9a-f]{8,})-", u) for u in photos(i)]
    toks = [t.group(1) for t in toks if t]
    q = i["model"].split()[0]
    if q not in QUKA_CACHE:
        st, page = get(f"{base}/arama?q={urllib.parse.quote(q)}")
        QUKA_CACHE[q] = list(dict.fromkeys(re.findall(r'href="(' + re.escape(base) + r'/[a-z0-9-]+)" class="c-p-i-link"', page)))
    for url in QUKA_CACHE[q][:24]:
        st, page = get(url)
        if st == 200 and any(t in page for t in toks): return url, page
    return None, None


# ---------------------------------------------------------------- Shopify (Aldo)
SHOPIFY = {}
def shopify_products(base):
    if base not in SHOPIFY:
        out = []
        for n in range(1, 40):
            st, body = get(f"{base}/products.json?limit=250&page={n}")
            if st != 200: break
            items = json.loads(body).get("products", [])
            if not items: break
            out += items
        SHOPIFY[base] = out
    return SHOPIFY[base]


def shopify_check(i, base):
    stems = {re.sub(r"_\d+\.\w+$", "", fname(u)) for u in photos(i)}
    for q in shopify_products(base):
        srcs = [im["src"] for im in q.get("images", [])]
        if not any(re.sub(r"_\d+\.\w+$", "", fname(s)) in stems for s in srcs): continue
        names = [o.get("name", "").lower() for o in q.get("options", [])]
        k = next((n + 1 for n, x in enumerate(names) if x in ("beden", "size", "numara")), 1)
        out = sorted({norm_size(v.get(f"option{k}")) for v in q.get("variants", []) if v.get("available")})
        return f"{base}/products/{q['handle']}", [s for s in out if SIZE_RE.match(s) or s == "One size"]
    return None, None


# ---------------------------------------------------------------- the check
def check(items, prev):
    old = prev.get("styles") or {}
    res, failed = {}, collections.Counter()
    for n, i in enumerate(items):
        kind, base = SITES[i["brand"]]
        p = old.get(i["ref"]) or {}
        url, stock = p.get("url"), None
        try:
            if kind == "shopify":
                url, stock = shopify_check(i, base)
                if url is None and shopify_products(base): res[i["ref"]] = {"on": 0}; continue
            else:
                read = tsoft_stock if kind == "tsoft" else quka_stock
                page = None
                if url:
                    st, page = get(url)
                    if st == 404: page = None; url = None
                    elif st != 200: failed[i["brand"]] += 1; res[i["ref"]] = p; continue   # site trouble: keep last week's
                if page is None:
                    url, page = (tsoft_find if kind == "tsoft" else quka_find)(i, base)
                if page is not None: stock = read(page)
        except Exception as e:
            print("  error", i["ref"], e)
        if url is None or stock is None:
            if p.get("url"): res[i["ref"]] = {"on": 0, "url": p["url"]}   # had a page, now gone: no longer listed
            continue                                                     # never found: not checked
        res[i["ref"]] = {"on": 1, "url": url, "stock": stock}
        if n % 20 == 0: print(f"  {n}/{len(items)} checked, {FETCHES} pages fetched")
    return res, failed


def in_stock(i, rec):
    if not rec: return None
    if not rec.get("on"): return []
    z = sizes_of(i)
    if z == ["One size"]: return z if rec.get("stock") else []
    return [s for s in z if s in rec.get("stock", [])]


def mark_back(res, prev, today):
    old = prev.get("styles") or {}
    for ref, rec in res.items():
        if not (rec.get("on") and rec.get("stock")): continue
        p = old.get(ref)
        if p is not None and (not p.get("on") or p.get("stock") == []): rec["back"] = today
        elif p and p.get("back"):
            try:
                if (datetime.date.fromisoformat(today) - datetime.date.fromisoformat(p["back"])).days < BACK_DAYS: rec["back"] = p["back"]
            except ValueError: pass


def label(i): return f"{i['brand']} {i['model']} · {i.get('colour') or ''}".strip(" ·")


def report(items, P, res, prev, failed, when):
    hidden = set(P.get("hidden", []))
    shop = [i for i in items if i["ref"] not in hidden]
    r = lambda i: res.get(i["ref"])
    old = prev.get("styles") or {}
    gone = [i for i in shop if r(i) and not r(i).get("on")]
    sold = [i for i in shop if r(i) and r(i).get("on") and in_stock(i, r(i)) == []]
    few = [i for i in shop if r(i) and r(i).get("on") and 0 < len(in_stock(i, r(i)) or []) <= 2]
    unknown = [i for i in shop if not r(i)]
    back = [i for i in items if r(i) and r(i).get("back") == when.strftime("%Y-%m-%d")]
    news = []
    if old:
        ns = [i for i in sold if not (old.get(i["ref"], {}).get("on") and in_stock(i, old.get(i["ref"])) == [])]
        if ns: news.append(f"**{len(ns)} newly sold out:** " + ", ".join(f"{i['ref']} ({label(i)})" for i in ns))
        if back: news.append(f"**{len(back)} back in stock:** " + ", ".join(f"{i['ref']} ({label(i)})" for i in back))
    lines = lambda xs: "\n".join(f"- `{i['ref']}` {label(i)}" + (f" ([page]({r(i)['url']}))" if r(i) and r(i).get("url") else "") for i in sorted(xs, key=lambda i: (i["brand"], i["model"], i.get("colour") or ""))) or "- none"
    per = collections.Counter(i["brand"] for i in shop); ok = collections.Counter(i["brand"] for i in shop if r(i))
    brand_rows = "\n".join(f"| {b} | {per[b]} | {ok[b]} |" for b in sorted(per))
    body = f"""Checked {when:%d %b %Y, %H:%M} UTC against the brands' own websites.

| Brand | Styles in your shop | Found and checked |
|---|---:|---:|
{brand_rows}

The shop and agent page block sizes these brands have sold out, hide a model sold out in every colour (it comes back
by itself), and show "Back in stock" for {BACK_DAYS} days. Brands not listed here aren't checked yet: confirm sizes
before payment for those.
{"" if not failed else chr(10) + "**Some pages didn't load this week** (" + ", ".join(f"{b}: {n}" for b, n in failed.items()) + "): last week's stock was kept for them." + chr(10)}
### Sold out in every size ({len(sold)})
{lines(sold)}

### No longer on the brand's site ({len(gone)})
{lines(gone)}

### Only 1–2 sizes left ({len(few)})
{lines(few)}

### Back in stock this week ({len(back)})
{lines(back)}

### Couldn't find the product page ({len(unknown)})
These aren't checked: the brand may have renamed or removed them. Check by hand before taking money.
{lines(unknown)}
"""
    summary = f"{len(shop)} styles from {len(per)} brands: {sum(ok.values())} checked, {len(sold)} sold out, {len(gone)} no longer listed, {len(back)} back in stock."
    return body, news, summary


def github(method, path, payload=None):
    tok, repo = os.environ.get("GITHUB_TOKEN"), os.environ.get("GITHUB_REPOSITORY")
    req = urllib.request.Request(f"https://api.github.com/repos/{repo}{path}", method=method,
                                 data=json.dumps(payload).encode() if payload is not None else None,
                                 headers={"Authorization": f"Bearer {tok}", "Accept": "application/vnd.github+json", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=40) as r: return json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        print("GitHub", method, path, e.code, e.read()[:300]); return None


def post(body, news, summary, first):
    found = github("GET", f"/issues?state=open&labels={LABEL}&per_page=5") or []
    issue = next((x for x in found if x.get("title") == ISSUE_TITLE), None)
    if issue: github("PATCH", f"/issues/{issue['number']}", {"body": body})
    else: issue = github("POST", "/issues", {"title": ISSUE_TITLE, "body": body, "labels": [LABEL]})
    if issue and news and not first:
        github("POST", f"/issues/{issue['number']}/comments", {"body": "Since last week:\n\n" + "\n\n".join(news) + f"\n\n{summary}"})


def main():
    items, P = catalogue()
    only = [a for a in sys.argv[1:] if not a.startswith("--")]
    if only: items = [i for i in items if i["brand"] in only]
    try: prev = json.load(open("brands.json"))
    except Exception: prev = {}
    print(f"{len(items)} styles to check")
    res, failed = check(items, prev)
    found = [i for i in items if i["ref"] in res]
    if items and len(found) < len(items) / 3:
        sys.exit(f"Only {len(found)} of {len(items)} styles were found on the brands' sites: something changed. Nothing was written.")
    when = datetime.datetime.now(datetime.timezone.utc)
    mark_back(res, prev, when.strftime("%Y-%m-%d"))
    body, news, summary = report(items, P, res, prev, failed, when)
    print(summary); print(); print(body)
    if news: print("\n".join(news))
    print(f"\n{FETCHES} pages fetched")
    if DRY:
        os.makedirs("probe-out", exist_ok=True)
        json.dump({"checked": when.strftime("%Y-%m-%dT%H:%MZ"), "styles": res}, open("probe-out/brands.json", "w"), indent=1)
        open("probe-out/report.md", "w").write(summary + "\n\n" + body)
        print("[dry run] report and results in probe-out/; nothing posted.")
        return
    json.dump({"checked": when.strftime("%Y-%m-%dT%H:%MZ"), "styles": res}, open("brands.json", "w"), separators=(",", ":"))
    post(body, news, summary, first=not prev.get("styles"))


if __name__ == "__main__":
    main()
