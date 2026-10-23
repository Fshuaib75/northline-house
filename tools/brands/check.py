"""Other brands weekly check. Runs on GitHub's servers every Monday (see .github/workflows/brands-check.yml).

The Capone check (tools/capone) covers Capone. This one covers the other brands whose own websites show stock per size:
  - T-Soft shops: Slazenger, Ziya, Tergan
  - Qukasoft shop: Sivarro
  - Shopify suppliers: the shared sourcing allowlist, including Aldo, Derimod, Marjin, Basic&Co., Les Benjamins
    and the explicitly listed Libas vendors; Ippocampo is checked at Capone's store.
For each style it finds the brand's product page (once; the link is remembered), reads which sizes are in stock, and
writes brands.json in the same shape as capone.json, so the shop and agent page block sold-out sizes, hide models sold
out in every colour and show "Back in stock" badges for these brands too. The report goes to the GitHub issue
"Other brands weekly check".

Brands not covered yet (their sites need their own reader): DESA, Elle, Bambi (Ticimax), the n11 marketplace brands,
DeFacto, LC Waikiki. Their styles are simply not in brands.json, which the pages treat as "assume available".

  python tools/brands/check.py           run in the gh-pages checkout: writes brands.json and posts the report
  python tools/brands/check.py --dry     prints the report only (development runs)
"""
import collections, datetime, gzip, hashlib, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

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
# Discovery and weekly checks share the same explicit supplier/vendor allowlist.
SUPPLIERS = json.loads((Path(__file__).resolve().parents[1] / "sourcing/sources.json").read_text(encoding="utf-8"))
for supplier in SUPPLIERS.values():
    for brand in supplier["vendors"].values():
        if brand != "Capone":  # Capone has its own scheduled checker.
            SITES.setdefault(brand, ("shopify", supplier["base"]))
FETCHES = 0


def get(url, tries=3):
    """(status, text). Gentle: one request every 1.2 s per run."""
    global FETCHES
    for n in range(tries):
        try:
            FETCHES += 1; time.sleep(1.0)
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
    if not stocks: return None
    labels = {a: norm_size(b) for a, b in re.findall(r'<a[^>]*\bdata-id="(\d+)"[^>]*>\s*<p>([^<]+)</p>', page)}
    is_size = lambda x: bool(SIZE_RE.match(labels.get(x, "")))
    if not any(is_size(part) for key in stocks for part in key.split("_")): return None
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
    if not isinstance(v.get("summary"), dict) or not v["summary"]: return None
    out = set()
    for name, rec in v["summary"].items():
        if isinstance(rec, dict) and rec.get("in_stock"):
            s = norm_size(re.split(r"[-/ ]", str(name))[-1])
            if SIZE_RE.match(s): out.add(s)
    return sorted(out)


QUKA_CACHE = {}
def quka_stems(i):
    """Photo file stems, e.g. 69df70a6dda3e-52694249 or boston-unisex-mantar-taban-terlik-haki-82197959."""
    return list(dict.fromkeys(m.group(1) for u in photos(i) for m in [re.search(r"/p/(.+?)-sw\d+sh\d+\.\w+$", u.split("?")[0])] if m))


def quka_is(page, stems):
    """The page is this style's own page when one of its photos is the page's main photo or fills its gallery.
    (Other colours of the model also appear on a page, once each, as links: those don't count.)"""
    og = re.search(r'property="og:image" content="([^"]+)"', page)
    if og and any(s in og.group(1) for s in stems): return True
    return any(page.count(s) >= 3 for s in stems)


def quka_find(i, base):
    """Guess the page from a named photo, else search the model; follow links to sibling colours that show our photo."""
    stems = quka_stems(i)
    if not stems: return None, None
    tried, todo = set(), []
    for s in stems:
        if re.search(r"[a-z]{3,}-", s):                     # named photo: the page address is the name minus the id
            todo.append(base + "/" + re.sub(r"-\d+$", "", s))
    words = [i["model"].split()[0]] + [s.split("-")[0] for s in stems if re.search(r"[a-z]{3,}-", s)]
    for q in dict.fromkeys(w.lower() for w in words):
        if q not in QUKA_CACHE:
            st, page = get(f"{base}/arama?q={urllib.parse.quote(q)}")
            QUKA_CACHE[q] = list(dict.fromkeys(re.findall(r'href="(' + re.escape(base) + r'/[a-z0-9-]+)" class="c-p-i-link"', page)))
        todo += QUKA_CACHE[q][:24]
    while todo and len(tried) < 30:
        url = todo.pop(0)
        if url in tried: continue
        tried.add(url); st, page = get(url)
        if st != 200: continue
        if quka_is(page, stems): return url, page
        for href in re.findall(r'<a href="(' + re.escape(base) + r'/[a-z0-9-]+)"[^>]*>\s*<img src="[^"]*(?:' + "|".join(re.escape(s) for s in stems) + r')', page):
            if href not in tried: todo.insert(0, href)            # a sibling-colour link showing our photo
    return None, None


# ---------------------------------------------------------------- Shopify (Aldo)
SHOPIFY = {}
SHOPIFY_ERRORS = {}
SHOPIFY_PAGES = {}
def shopify_products(base):
    """Cache only a complete catalogue; a failed later page is not evidence of removal."""
    if base in SHOPIFY_ERRORS:
        raise RuntimeError(SHOPIFY_ERRORS[base])
    if base not in SHOPIFY:
        out = []
        try:
            for n in range(1, 40):
                st, body = get(f"{base}/products.json?limit=250&page={n}")
                if st != 200:
                    raise ValueError(f"catalogue page {n}: HTTP {st}")
                payload = json.loads(body)
                if not isinstance(payload, dict) or not isinstance(payload.get("products"), list):
                    raise ValueError(f"catalogue page {n}: missing products list")
                items = payload["products"]
                if not items:
                    if not out: raise ValueError("empty supplier catalogue")
                    SHOPIFY[base] = out
                    return out
                out += items
            raise ValueError("catalogue exceeded pagination limit without an end page")
        except (ValueError, TypeError) as e:
            SHOPIFY_ERRORS[base] = str(e)
            raise RuntimeError(str(e)) from e
    return SHOPIFY[base]


def product_link(value, base):
    """Only a known supplier's plain product URL can select a direct read."""
    try:
        u, origin = urllib.parse.urlsplit(value or ""), urllib.parse.urlsplit(base)
        if u.scheme != "https" or u.netloc != origin.netloc or u.username or u.password: return None
        if not re.fullmatch(r"/products/[A-Za-z0-9-]+/?", u.path): return None
        return base + u.path.rstrip("/")
    except ValueError:
        return None


def stock_size(value):
    text = str(value or "").strip().replace(",", ".")
    if text.casefold() in ("standart", "std", "tek beden", "one size", "o/s"): return "One size"
    named = {"extra small":"XS", "small":"S", "medium":"M", "large":"L", "extra large":"XL"}
    if text.casefold() in named: return named[text.casefold()]
    if re.fullmatch(r"\d{2}(?:\.5)?|XXS|XS|S|M|L|XL|XXL|XXXL|[2-5]XL", text, re.I): return text.upper()
    return None


def shopify_stock(i, q):
    """Return stock for this colour only; ambiguous/missing evidence is unknown."""
    options = q.get("options") or []
    size = next((o.get("position") for o in options if str(o.get("name", "")).casefold() in ("beden", "size", "numara")), None)
    colour = next((o.get("position") for o in options if str(o.get("name", "")).casefold() in ("renk", "color", "colour")), None)
    variants = q.get("variants")
    if not isinstance(variants, list) or not variants: return None
    if colour:
        values = {str(v.get(f"option{colour}") or "") for v in variants}
        if "" in values: return None
        if len(values) > 1:
            # Sourcing refs carry a digest of the exact original colour option.
            digest = str(i.get("ref", "")).rsplit("-", 1)[-1]
            matches = {c for c in values if hashlib.sha256(c.encode()).hexdigest()[:8].upper() == digest}
            if not matches:
                keys = {fname(u) for u in photos(i)}
                images = [im for im in q.get("images", []) if fname(im.get("src", "")) in keys]
                ids = {im["id"] for im in images if im.get("id") is not None}
                vids = {vid for im in images for vid in im.get("variant_ids", [])}
                matches = {str(v.get(f"option{colour}")) for v in variants if v.get("id") in vids or (v.get("featured_image") or {}).get("id") in ids}
            if len(matches) != 1: return None
            variants = [v for v in variants if str(v.get(f"option{colour}")) in matches]
    if any(not isinstance(v.get("available"), bool) for v in variants): return None
    if not size:
        # A bag without a size option is a single item; clothing must expose its sizes.
        if i.get("cat") != "bags": return None
        return ["One size"] if any(v["available"] for v in variants) else []
    labels = [(stock_size(v.get(f"option{size}")), v["available"]) for v in variants]
    if any(label is None for label, _ in labels): return None
    catalogue_labels = {stock_size(s): str(s) for s in i.get("sizes", []) if stock_size(s)}
    return sorted({catalogue_labels.get(label, label) for label, available in labels if available})


def shopify_check(i, base):
    vendor_map = next((s["vendors"] for s in SUPPLIERS.values() if s["base"] == base), {})
    allowed = {v.casefold() for v, brand in vendor_map.items() if brand == i["brand"]}
    def vendor_ok(q): return str(q.get("vendor", "")).casefold() in allowed
    direct = product_link(i.get("page"), base)
    if direct:
        if direct not in SHOPIFY_PAGES:
            status, body = get(direct + ".json")
            if status != 200: raise ValueError(f"Supplier product HTTP {status}")
            q = json.loads(body).get("product")
            if not isinstance(q, dict) or not q.get("id"): raise ValueError("Missing supplier product data")
            if any(not isinstance(v.get("available"), bool) for v in q.get("variants", [])):
                # Shopify product JSON supplies identity/options; Ajax supplies availability.
                status, body = get(direct + ".js")
                if status != 200: raise ValueError(f"Supplier availability HTTP {status}")
                ajax = json.loads(body)
                if not isinstance(ajax, dict) or str(ajax.get("id")) != str(q["id"]): raise ValueError("Availability product identity mismatch")
                availability = {str(v.get("id")): v.get("available") for v in ajax.get("variants", [])}
                for v in q.get("variants", []): v["available"] = availability.get(str(v.get("id")))
            SHOPIFY_PAGES[direct] = q
        q = SHOPIFY_PAGES[direct]
        if not vendor_ok(q) or direct.rsplit("/", 1)[-1] != q.get("handle"): return None, None
        # Generated sourcing refs identify the supplier product, even if photos change.
        ref_match = re.search(r"-(\d+)-[A-F0-9]{8}$", str(i.get("ref", "")))
        if ref_match and ref_match.group(1) != str(q["id"]): return None, None
        return direct, shopify_stock(i, q)
    stems = {fname(u) for u in photos(i)}
    matches = [q for q in shopify_products(base) if vendor_ok(q) and any(fname(im.get("src", "")) in stems for im in q.get("images", []))]
    if len(matches) != 1: return None, None
    q = matches[0]
    return f"{base}/products/{q['handle']}", shopify_stock(i, q)


# ---------------------------------------------------------------- the check
def check(items, prev):
    old = prev.get("styles") or {}
    res, failed = {}, collections.Counter()
    checked_at = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ")

    def uncertain(i, previous, reason):
        failed[i["brand"]] += 1
        if previous:
            res[i["ref"]] = {**previous, "stale": True, "check_error": reason}

    for n, i in enumerate(items):
        kind, base = SITES[i["brand"]]
        p = old.get(i["ref"]) or {}
        url, stock = p.get("url"), None
        try:
            if kind == "shopify":
                url, stock = shopify_check(i, base)
                if url is None:
                    # Image matching can fail when a supplier replaces its photos.
                    uncertain(i, p, "Product could not be matched in supplier catalogue")
                    continue
            else:
                read = tsoft_stock if kind == "tsoft" else quka_stock
                page = None
                if url:
                    st, page = get(url)
                    if st == 404: page = None; url = None
                    elif st != 200:
                        uncertain(i, p, f"Product page HTTP {st}")
                        continue
                if page is None:
                    url, page = (tsoft_find if kind == "tsoft" else quka_find)(i, base)
                if page is not None: stock = read(page)
        except Exception as e:
            print("  error", i["ref"], e)
            uncertain(i, p, "Supplier response could not be read")
            continue
        if url is None or stock is None:
            uncertain(i, p, "Product or stock data could not be verified")
            continue
        res[i["ref"]] = {"on": 1, "url": url, "stock": stock, "checked_at": checked_at}
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
        if rec.get("stale") or not (rec.get("on") and rec.get("stock")): continue
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
    stale = [i for i in shop if r(i) and r(i).get("stale")]
    back = [i for i in items if r(i) and not r(i).get("stale") and r(i).get("back") == when.strftime("%Y-%m-%d")]
    news = []
    if old:
        ns = [i for i in sold if not r(i).get("stale") and not (old.get(i["ref"], {}).get("on") and in_stock(i, old.get(i["ref"])) == [])]
        if ns: news.append(f"**{len(ns)} newly sold out:** " + ", ".join(f"{i['ref']} ({label(i)})" for i in ns))
        if back: news.append(f"**{len(back)} back in stock:** " + ", ".join(f"{i['ref']} ({label(i)})" for i in back))
    lines = lambda xs: "\n".join(f"- `{i['ref']}` {label(i)}" + (f" ([page]({r(i)['url']}))" if r(i) and r(i).get("url") else "") for i in sorted(xs, key=lambda i: (i["brand"], i["model"], i.get("colour") or ""))) or "- none"
    per = collections.Counter(i["brand"] for i in shop); ok = collections.Counter(i["brand"] for i in shop if r(i) and not r(i).get("stale"))
    brand_rows = "\n".join(f"| {b} | {per[b]} | {ok[b]} |" for b in sorted(per))
    body = f"""Checked {when:%d %b %Y, %H:%M} UTC against the brands' own websites.

| Brand | Styles in your shop | Found and checked |
|---|---:|---:|
{brand_rows}

The shop and agent page block sizes these brands have sold out, hide a model sold out in every colour (it comes back
by itself), and show "Back in stock" for {BACK_DAYS} days. Brands not listed here aren't checked yet: confirm sizes
before payment for those.
{"" if not failed else chr(10) + "**Some pages didn't load this week** (" + ", ".join(f"{b}: {n}" for b, n in failed.items()) + "): last known stock was kept where available; new unresolved products remain unchecked." + chr(10)}
### Not verified this run — last known stock retained ({len(stale)})
These records are not fresh stock confirmations. Check the supplier before accepting payment.
{lines(stale)}

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
    found = [i for i in items if i["ref"] in res and not res[i["ref"]].get("stale")]
    if items and len(found) < len(items) / 3:
        sys.exit(f"Only {len(found)} of {len(items)} styles were found on the brands' sites: something changed. Nothing was written.")
    when = datetime.datetime.now(datetime.timezone.utc)
    mark_back(res, prev, when.strftime("%Y-%m-%d"))
    body, news, summary = report(items, P, res, prev, failed, when)
    print(summary); print(); print(body)
    if news: print("\n".join(news))
    print(f"\n{FETCHES} pages fetched")
    # A brand-filtered run must not erase records belonging to other brands.
    if only:
        selected = {i["ref"] for i in items}
        res = {**{k: v for k, v in prev.get("styles", {}).items() if k not in selected}, **res}
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
