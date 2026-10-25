"""Owner rule (24 Oct 2026): store photos show the product only, never a female body.

Builds photo-rules.json from the photo check report (tools/sourcing/vision.py, branch photo-model-report) and writes
the same list into the shop page and the agent page, so every photo source is filtered in the browser: the built-in
catalogue, products added from the book, and Capone's weekly photo refresh. The Instagram robot reads photo-rules.json.

  python tools/photos/no_people.py --report report.json --site .            # rebuild the list and inject it
  python tools/photos/no_people.py --site .                                  # re-inject the existing list

Photos are matched by file name, so the same photo at another size or on another host is caught too.
"""
import argparse
import json
import os
import re

PERSON_LIMIT = 0.5
START, END = "/*NL-PHOTO-RULES*/", "/*/NL-PHOTO-RULES*/"


def key(url):
    return str(url or "").split("?")[0].rstrip("/").split("/")[-1]


def build(report, extra=(), keep=()):
    """extra: photo URLs found by eye; keep: refs (male-only styles) whose people photos stay because no other exists."""
    keep = set(keep)
    photos, best = set(key(u) for u in extra), {}
    for item in report["items"]:
        if item["ref"] in keep:
            continue
        people = [p for p in item["photos"] if p["person"] >= PERSON_LIMIT]
        if not people:
            continue
        photos.update(key(p["url"]) for p in people)
        if item.get("best_whole_photo"):
            best[item["ref"]] = key(item["best_whole_photo"])
    return {"note": "Photos never shown in the store (owner rule: product-only, no female body). "
                    "Built by tools/photos/no_people.py from the photo check. Matched by file name.",
            "photos": sorted(photos), "best": dict(sorted(best.items()))}


def snippet(rules):
    data = json.dumps({"photos": rules["photos"], "best": rules["best"]}, separators=(",", ":"))
    return (START + "\n// Owner rule: product-only photos, never a female body. List: photo-rules.json (tools/photos/no_people.py).\n"
            f"const NL_RULES={data}, NL_BLOCK=new Set(NL_RULES.photos);\n"
            "const nlKey=u=>String(u||\"\").split(\"?\")[0].replace(/\\/+$/,\"\").split(\"/\").pop();\n"
            "function nlClean(i){ const ok=u=>u&&!NL_BLOCK.has(nlKey(u)), imgs=(i.imgs||[]).filter(ok);\n"
            "  const all=[i.img,i.full,...(i.imgs||[])].filter(Boolean); if(all.every(ok)) return i;\n"
            "  const pool=imgs.length?imgs:[i.full,i.img].filter(ok); if(!pool.length) return i;   // nothing clean: the style is hidden in prices.json\n"
            "  const want=NL_RULES.best[i.ref], main=pool.find(u=>nlKey(u)===want)||pool[0];\n"
            "  return {...i, img:ok(i.img)?i.img:main, full:ok(i.full)?i.full:main, imgs:[main,...imgs.filter(u=>u!==main)]}; }\n"
            "ALL=ALL.map(nlClean);\n" + END)


def inject(html):
    block = snippet(RULES)
    if START in html:
        return re.sub(re.escape(START) + ".*?" + re.escape(END), lambda m: block, html, flags=re.S)
    m = re.search(r"let ALL = \[.*?\];\n", html, re.S)
    if not m:
        raise SystemExit("catalogue not found")
    out = html[:m.end()] + block + "\n" + html[m.end():]
    # Capone's weekly refresh and products added from the book replace photos later: clean again after them.
    out, n = re.subn(r"capPhotos\(cap\);", "capPhotos(cap); ALL=ALL.map(nlClean);", out)
    if n != 1:
        raise SystemExit(f"expected one capPhotos(cap) call, found {n}")
    return out


if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("--site", required=True)
    a.add_argument("--report")
    a.add_argument("--extra", nargs="*", default=[])
    a.add_argument("--keep", nargs="*", default=[])
    args = a.parse_args()
    path = os.path.join(args.site, "photo-rules.json")
    RULES = build(json.load(open(args.report)), args.extra, args.keep) if args.report else json.load(open(path))
    json.dump(RULES, open(path, "w"), indent=1)
    for page in ("shop/index.html", "index.html"):
        p = os.path.join(args.site, page)
        with open(p) as f:
            html = f.read()   # read fully before opening for writing
        out = inject(html)
        with open(p, "w") as f:
            f.write(out)
    print(f"{len(RULES['photos'])} photos blocked, {len(RULES['best'])} styles get a product-only main photo")
