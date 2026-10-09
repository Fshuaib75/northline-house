import json, os, re, time, urllib.request, urllib.error, gzip
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
os.makedirs("probe-out", exist_ok=True)
KEYS = re.compile(r"(stok|stock|beden|variant|varyant|inStock|availab|sizes?\b|tukendi|tükendi|sepete)", re.I)
out = []
for n, line in enumerate(open("tools/probe_urls.txt")):
    url = line.strip()
    if not url or url.startswith("#"): continue
    rec = {"url": url}
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/json,*/*", "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8", "Accept-Encoding": "gzip"})
        with urllib.request.urlopen(req, timeout=40) as r:
            body = r.read()
            if r.headers.get("Content-Encoding") == "gzip": body = gzip.decompress(body)
            rec.update(status=r.status, final=r.geturl(), ctype=r.headers.get("Content-Type"), size=len(body))
    except urllib.error.HTTPError as e:
        body = e.read(); rec.update(status=e.code, size=len(body))
    except Exception as e:
        body = b""; rec.update(error=str(e))
    text = body.decode("utf-8", "replace")
    fn = f"probe-out/{n:02d}.txt"; open(fn, "w").write(text[:400000]); rec["file"] = fn
    rec["links"] = sorted(set(re.findall(r'href="(/[^"#?]{8,120})"', text)))[:80]
    rec["hits"] = [text[max(0, m.start()-120):m.end()+200].replace("\n", " ") for m in list(KEYS.finditer(text))[:25]]
    out.append(rec); time.sleep(1.5)
json.dump(out, open("probe-out/index.json", "w"), ensure_ascii=False, indent=1)
