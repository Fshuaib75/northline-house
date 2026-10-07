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
    if prods:
        p = prods[0]
        print("product keys:", sorted(p.keys()))
        print("variant keys:", sorted(p["variants"][0].keys()) if p.get("variants") else None)
        print("image keys:", sorted(p["images"][0].keys()) if p.get("images") else None)
        print("options:", p.get("options"))
        for q in prods[:3]:
            print("--", q.get("handle"), "|", q.get("title"), "| type", q.get("product_type"), "| tags", (q.get("tags") or [])[:8])
            print("   variants:", [(v.get("sku"), v.get("option1"), v.get("option2"), v.get("available"), v.get("price")) for v in q.get("variants", [])[:6]])
            print("   images:", [fname(i["src"]) for i in q.get("images", [])[:6]])
    # stems on the store
    store = collections.defaultdict(list)
    nost = collections.Counter()
    for q in prods:
        for im in q.get("images", []):
            s = stem(im["src"])
            if s: store[s].append(q["handle"])
            else: nost[fname(im["src"])[:40]] += 1
    print("\nstore image stems:", len(store), "| images without a stem:", sum(nost.values()), list(nost)[:8])
    # our Capone styles
    hidden = set(P.get("hidden", []))
    def ours(i):
        return {stem(u) for u in [i.get("img")] + (i.get("imgs") or []) if u and stem(u)}
    res = collections.Counter(); miss = []
    for i in cap:
        st = ours(i)
        grp = "hidden" if i["ref"] in hidden else ("shop" if i["ref"] in P["prices"] else "unpriced")
        hit = any(s in store for s in st)
        res[(grp, "no stem" if not st else ("found" if hit else "not found"))] += 1
        if st and not hit and grp != "unpriced" and len(miss) < 12: miss.append((i["ref"], sorted(st)[:2]))
    print("\nour Capone styles vs the store:")
    for k, v in sorted(res.items()): print("  ", k, v)
    print("sample not found:", miss)
    # article code only (without colour), to see if styles moved to new photos
    art = collections.Counter(s.rsplit("_", 1)[0] for s in store)
    def arts(i): return {s.rsplit("_", 1)[0] for s in ours(i)}
    r2 = collections.Counter()
    for i in cap:
        if i["ref"] in hidden:
            r2["hidden: article still on the store" if any(a in art for a in arts(i)) else "hidden: article gone"] += 1
    print(r2)

if __name__ == "__main__":
    main()
