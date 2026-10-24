"""Northline photo check: looks at supplier photos with an open image model (OpenCLIP, runs on CPU, no paid API).

Two jobs, both zero-shot (no training data needed):
  1. Minimal score: how much each product photo looks like a plain, quiet piece versus a loud one
     (stones, prints, glitter, logos, studs, platforms, mesh, neon). 1.0 = calm, 0.0 = loud.
  2. Photo type: whole item, close-up, worn by a person, sole, or back view, so the shop and hero can use
     whole-item shots and skip crops.

It only ranks and flags. The owner still approves every product.

  python tools/sourcing/vision.py --products products.json --keywords keywords.json --out report/
"""
import argparse
import io
import json
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

MODEL, PRETRAINED = "ViT-B-32", "laion2b_s34b_b79k"

NOUN = {"shoes": "shoe", "bags": "bag", "clothing": "piece of clothing", "accessories": "accessory"}
CALM = [
    "a photo of a plain minimal {n} in one solid neutral colour",
    "a photo of a simple {n} made of smooth leather with clean lines",
    "a photo of a simple suede {n} with a small plain buckle",
]
LOUD = [
    "a photo of a {n} decorated with rhinestones, crystals or jewels",
    "a photo of a {n} with an animal print like leopard, zebra or crocodile",
    "a photo of a shiny glittery metallic gold or silver {n}",
    "a photo of a {n} with a large visible brand logo",
    "a photo of a {n} with studs, bows, pearls or fringe",
    "a photo of a {n} with a thick chunky platform sole",
    "a photo of a {n} made of mesh or transparent plastic",
    "a photo of a brightly coloured neon or multicoloured {n}",
]
TYPES = {
    "whole": ["a product photo of a whole {n} on a plain white background",
              "a product photo of a pair of {n}s seen from above on a plain background"],
    "closeup": ["a close-up detail photo of part of a {n}",
                "a macro photo of the material and stitching of a {n}"],
    "worn": ["a photo of a person wearing or carrying a {n}", "a photo of feet wearing {n}s"],
    "sole": ["a photo of the bottom sole of a {n}"],
    "back": ["a photo of the back of a {n}"],
}
UA = {"User-Agent": "Mozilla/5.0 (Northline photo check; owner review tool)"}


# ---------- pure helpers (tested in tools/tests/test_vision.py, no model needed) ----------

def softmax(xs, scale=100.0):
    import math
    m = max(xs)
    e = [math.exp(scale * (x - m)) for x in xs]
    s = sum(e)
    return [v / s for v in e]


def calm_probability(calm_sims, loud_sims):
    """Share of probability on the calm prompts, from cosine similarities."""
    p = softmax(list(calm_sims) + list(loud_sims))
    return sum(p[: len(calm_sims)])


def photo_type(type_sims):
    """type_sims: {label: [sims]} -> (label, {label: probability})."""
    labels = list(type_sims)
    best = [max(type_sims[k]) for k in labels]
    p = softmax(best)
    probs = dict(zip(labels, p))
    return max(probs, key=probs.get), probs


def item_score(images):
    """Item minimal score: mean over product-only photos (whole or close-up); falls back to all photos.
    Worn shots are left out because people, outfits and rooms add colour that isn't the product."""
    use = [im for im in images if im["type"] in ("whole", "closeup")] or images
    return sum(im["calm"] for im in use) / len(use) if use else None


def auc(scores_bad, scores_good):
    """Probability a random loud item scores lower (less calm) than a random calm one."""
    if not scores_bad or not scores_good:
        return None
    wins = sum((b < g) + 0.5 * (b == g) for b in scores_bad for g in scores_good)
    return wins / (len(scores_bad) * len(scores_good))


def compare(items, keywords):
    """Agreement between the photo score and the keyword rule (tools/sourcing/minimal.mjs)."""
    rows = [i for i in items if i.get("score") is not None and i["ref"] in keywords]
    bad = sorted((i for i in rows if not keywords[i["ref"]]["ok"]), key=lambda i: i["score"])
    good = sorted((i for i in rows if keywords[i["ref"]]["ok"]), key=lambda i: i["score"])
    k = len(bad)
    flagged = sorted(rows, key=lambda i: i["score"])[:k]  # the photo model flags as many as the keywords do
    caught = [i for i in flagged if not keywords[i["ref"]]["ok"]]
    return {
        "items": len(rows), "keyword_flagged": k,
        "auc": auc([i["score"] for i in bad], [i["score"] for i in good]),
        "caught_in_top_k": len(caught),
        "photo_only_flags": [i["ref"] for i in flagged if keywords[i["ref"]]["ok"]],
        "keyword_only_flags": [i["ref"] for i in bad if i not in flagged],
    }


# ---------- model and IO ----------

def fetch(url):
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=25) as r:
            data = r.read(8_000_000)
        from PIL import Image
        im = Image.open(io.BytesIO(data)).convert("RGB")
        im.thumbnail((448, 448))
        return im
    except Exception as e:  # a missing photo is reported, never invented
        return e


def run(products, keywords, out, limit_imgs=6):
    import torch
    import open_clip
    from PIL import Image, ImageDraw

    torch.set_num_threads(os.cpu_count() or 2)
    model, _, preprocess = open_clip.create_model_and_transforms(MODEL, pretrained=PRETRAINED)
    tokenizer = open_clip.get_tokenizer(MODEL)
    model.eval()

    def encode_text(texts):
        with torch.no_grad():
            t = model.encode_text(tokenizer(texts))
        return t / t.norm(dim=-1, keepdim=True)

    text = {}
    for cat, n in NOUN.items():
        text[cat] = {
            "calm": encode_text([p.format(n=n) for p in CALM]),
            "loud": encode_text([p.format(n=n) for p in LOUD]),
            "types": {k: encode_text([p.format(n=n) for p in v]) for k, v in TYPES.items()},
        }

    items = [i for i in products if i.get("cat") in NOUN]
    jobs = [(i["ref"], u) for i in items for u in (i.get("imgs") or [i.get("img")])[:limit_imgs] if u]
    with ThreadPoolExecutor(16) as ex:
        pics = dict(zip(jobs, ex.map(lambda j: fetch(j[1]), jobs)))
    failed = sum(isinstance(v, Exception) for v in pics.values())
    print(f"photos: {len(jobs)} requested, {failed} failed", flush=True)

    results, thumbs = [], {}
    for item in items:
        t = text[item["cat"]]
        urls = [u for u in (item.get("imgs") or [item.get("img")])[:limit_imgs] if u]
        ok = [(u, pics[(item["ref"], u)]) for u in urls if not isinstance(pics.get((item["ref"], u)), Exception)]
        imgs = []
        if ok:
            with torch.no_grad():
                e = model.encode_image(torch.stack([preprocess(im) for _, im in ok]))
            e = e / e.norm(dim=-1, keepdim=True)
            for (u, im), v in zip(ok, e):
                calm = calm_probability((v @ t["calm"].T).tolist(), (v @ t["loud"].T).tolist())
                label, probs = photo_type({k: (v @ m.T).tolist() for k, m in t["types"].items()})
                loud_sims = (v @ t["loud"].T).tolist()
                imgs.append({"url": u, "calm": round(calm, 4), "type": label,
                             "type_probs": {k: round(p, 3) for k, p in probs.items()},
                             "loudest": LOUD[loud_sims.index(max(loud_sims))].format(n=NOUN[item["cat"]])})
                thumbs[u] = im
        whole = [im for im in imgs if im["type"] == "whole"]
        best = max(whole, key=lambda im: im["type_probs"]["whole"])["url"] if whole else None
        score = item_score(imgs)
        results.append({"ref": item["ref"], "brand": item["brand"], "model": item.get("model"),
                        "colour": item.get("colour"), "cat": item["cat"],
                        "score": None if score is None else round(score, 4),
                        "best_whole_photo": best, "main_photo_type": imgs[0]["type"] if imgs else None,
                        "keyword_ok": keywords.get(item["ref"], {}).get("ok"),
                        "keyword_reason": keywords.get(item["ref"], {}).get("reason"), "photos": imgs})

    os.makedirs(out, exist_ok=True)
    cmp = compare(results, keywords)
    by = {r["ref"]: r for r in results}
    types = {}
    for r in results:
        for im in r["photos"]:
            types[im["type"]] = types.get(im["type"], 0) + 1
    main_not_whole = [r["ref"] for r in results if r["main_photo_type"] and r["main_photo_type"] != "whole"]
    report = {"model": f"OpenCLIP {MODEL} ({PRETRAINED})", "photos_requested": len(jobs), "photos_failed": failed,
              "photo_types": types, "main_photo_not_whole": main_not_whole, "comparison": cmp, "items": results}
    json.dump(report, open(os.path.join(out, "report.json"), "w"), indent=1)

    def sheet(name, refs, title):
        refs = [r for r in refs if by.get(r) and by[r]["photos"]][:48]
        if not refs:
            return
        cols, w, h = 6, 220, 290
        canvas = Image.new("RGB", (cols * w, 40 + ((len(refs) + cols - 1) // cols) * h), "white")
        d = ImageDraw.Draw(canvas)
        d.text((10, 12), title, fill="black")
        for n, ref in enumerate(refs):
            r = by[ref]
            url = r["best_whole_photo"] or r["photos"][0]["url"]
            im = thumbs[url].copy()
            im.thumbnail((w - 10, h - 70))
            x, y = (n % cols) * w + 5, 40 + (n // cols) * h
            canvas.paste(im, (x, y))
            kw = "kw:OK" if r["keyword_ok"] else f"kw:NO"
            for k, line in enumerate([f"{r['brand']} {r['model']}"[:34], f"{r['colour']}"[:34],
                                      f"calm {r['score']:.2f}  {kw}"]):
                d.text((x, y + h - 66 + 16 * k), line, fill="black")
        canvas.save(os.path.join(out, name))

    ranked = sorted((r for r in results if r["score"] is not None), key=lambda r: r["score"])
    sheet("1-photo-flags-keywords-missed.png", cmp["photo_only_flags"],
          "Photo model says loud, keyword rule said fine (lowest calm first)")
    sheet("2-keyword-flagged.png", [r["ref"] for r in ranked if r["keyword_ok"] is False],
          "Keyword rule flagged these (sorted by photo calm score)")
    sheet("3-calmest.png", [r["ref"] for r in reversed(ranked)], "Calmest by photo")
    sheet("4-loudest.png", [r["ref"] for r in ranked], "Loudest by photo")

    # Photo type check: every photo of 12 items, labelled.
    sample = [r for r in results if len(r["photos"]) >= 4][:: max(1, len(results) // 12)][:12]
    if sample:
        w, h = 170, 200
        canvas = Image.new("RGB", (6 * w, 30 + len(sample) * h), "white")
        d = ImageDraw.Draw(canvas)
        d.text((10, 10), "Photo types (best whole-item shot marked *)", fill="black")
        for row, r in enumerate(sample):
            for col, im in enumerate(r["photos"][:6]):
                t = thumbs[im["url"]].copy()
                t.thumbnail((w - 10, h - 30))
                x, y = col * w + 5, 30 + row * h
                canvas.paste(t, (x, y))
                star = "*" if im["url"] == r["best_whole_photo"] else ""
                d.text((x, y + h - 26), f"{im['type']}{star} {im['type_probs'][im['type']]:.2f}", fill="black")
        canvas.save(os.path.join(out, "5-photo-types.png"))

    lines = [f"## Photo model test ({report['model']})", "",
             f"- Photos read: {len(jobs) - failed} of {len(jobs)}",
             f"- Styles scored: {cmp['items']}",
             f"- Keyword rule flags {cmp['keyword_flagged']}; photo model's {cmp['keyword_flagged']} least calm include "
             f"{cmp['caught_in_top_k']} of them",
             f"- Ranking agreement (AUC, 0.5 = chance, 1.0 = perfect): {cmp['auc']:.3f}" if cmp["auc"] is not None else "- AUC: n/a",
             f"- Photo-only flags (to check by eye): {len(cmp['photo_only_flags'])}",
             f"- Photo types: {types}",
             f"- Styles whose main photo is not a whole-item shot: {len(main_not_whole)}"]
    open(os.path.join(out, "summary.md"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))
    return report


def main(argv=None):
    a = argparse.ArgumentParser()
    a.add_argument("--products", required=True)
    a.add_argument("--keywords", required=True)
    a.add_argument("--out", required=True)
    a.add_argument("--images", type=int, default=6)
    args = a.parse_args(argv)
    run(json.load(open(args.products)), json.load(open(args.keywords)), args.out, args.images)


if __name__ == "__main__":
    sys.exit(main())
