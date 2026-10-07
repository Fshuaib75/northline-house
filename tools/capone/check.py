"""Capone check (probe stage): read Capone's public product list and print what it looks like.

Runs on GitHub's servers (this repo's Actions). Prints a summary only; changes nothing.
"""
import json, re, sys, time, urllib.request, urllib.error, collections

STORE = "https://www.caponeoutfitters.com.tr"
UA = "Mozilla/5.0 (compatible; NorthlineCatalogueCheck/1.0)"

def get(url, tries=4):
    for n in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                time.sleep(5 * (n + 1)); continue
            return e.code, b""
        except Exception as e:
            print("  fetch error", url, e); time.sleep(5 * (n + 1))
    return 0, b""

def products():
    out = []
    for page in range(1, 40):
        st, body = get(f"{STORE}/products.json?limit=250&page={page}")
        if st != 200:
            print("page", page, "status", st); break
        items = json.loads(body).get("products", [])
        print("page", page, "products", len(items))
        if not items: break
        out += items
        time.sleep(1.5)
    return out

STEM = re.compile(r"^(.*_[A-Z]+\d+)_\d+(?:_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?\.\w+$")
def fname(u): return u.split("?")[0].rsplit("/", 1)[-1]
def stem(u):
    m = STEM.match(fname(u)); return m.group(1) if m else None

def catalogue():
    html = open("shop/index.html", encoding="utf-8").read()
    ALL = json.loads(re.search(r"let ALL = (\[.*?\]);\n", html, re.S).group(1))
    added = json.load(open("products.json"))
    known = {i["ref"] for i in ALL}
    items = ALL + [a for a in added if a.get("ref") not in known]
    P = json.load(open("prices.json"))
    return [i for i in items if i.get("brand") == "Capone"], P

def main():
    cap, P = catalogue()
    prods = products()
    print("\n== Capone store:", len(prods), "products")
    hidden = set(P.get("hidden", []))
    by_stem = collections.defaultdict(list)          # stem -> [(product, image src)]
    for q in prods:
        for im in sorted(q.get("images", []), key=lambda x: x.get("position", 0)):
            s = stem(im["src"])
            if s: by_stem[s].append((q, im["src"]))
    def ours(i): return [stem(u) for u in [i.get("img")] + (i.get("imgs") or []) if u and stem(u)]
    def sizes(q, s):
        art, col = s.rsplit("_", 1)
        vs = [v for v in q.get("variants", []) if (v.get("sku") or "").startswith(art + col)]
        return vs
    shown = 0
    stats = collections.Counter()
    for i in cap:
        grp = "hidden" if i["ref"] in hidden else ("shop" if i["ref"] in P["prices"] else "unpriced")
        if grp == "unpriced": continue
        st = [x for x in ours(i) if x]
        s0 = st[0] if st else None
        hits = by_stem.get(s0, []) if s0 else []
        if not hits:
            stats[(grp, "not on store")] += 1
            art = s0.rsplit("_", 1)[0] if s0 else ""
            alt = sorted({k for k in by_stem if art and k.startswith(art)})
            print("NOT ON STORE", grp, i["ref"], s0, "| same article on store:", alt[:4])
            continue
        q = hits[0][0]
        vs = sizes(q, s0)
        avail = [v.get("option2") or v.get("option1") for v in vs if v.get("available")]
        same = fname(i["img"]) in [fname(u) for _, u in hits]
        stats[(grp, "listed", "same file" if same else "new file", "in stock" if avail else ("sold out" if vs else "no matching sizes"))] += 1
        if grp == "hidden" and shown < 6:
            shown += 1
            print("HIDDEN", i["ref"], "| ours:", fname(i["img"]), "| store:", [fname(u) for _, u in hits][:3], "| sizes ours", i.get("sizes"), "| in stock", avail, "| products", len({id(h[0]) for h in hits}))
    print("\nsummary:")
    for k, v in sorted(stats.items()): print("  ", k, v)
    # does an image src on the store load as given, with and without ?width
    q = prods[0]; u = q["images"][0]["src"]
    print("\nsample src:", u)
    for t in [u, u.split("?")[0] + "?width=700", u.replace("https://cdn.shopify.com/s/files/1/0566/3732/5374/files/", STORE + "/cdn/shop/files/")]:
        print("  ", get(t)[0], t[:120])

if __name__ == "__main__":
    main()
