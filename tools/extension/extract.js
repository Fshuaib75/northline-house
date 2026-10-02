// Runs inside the product page you are looking at (injected only when you click the extension).
// Reads what the page already shows you: product data built into the page (Schema.org JSON-LD),
// share tags (Open Graph), the shop's public product file on Shopify stores, then a scan of the page.
// It never loads other pages, never logs in and never gets past any block: it only reads the tab you opened.
(async () => {
  const out = { url: location.href.split("#")[0], host: location.hostname.replace(/^www\./, ""), title: "", brand: "", sku: "",
    price: null, currency: "", images: [], sizes: [], colour: "", desc: "", crumbs: [], source: [] };
  const txt = s => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  const abs = u => { try { return new URL(u, location.href).href; } catch (e) { return ""; } };
  const addImg = u => { u = abs(typeof u === "object" && u ? (u.url || u.contentUrl || "") : u);
    if (!u || u.startsWith("data:") || /\.svg(\?|$)|logo|icon|sprite|placeholder/i.test(u)) return;
    if (!out.images.includes(u)) out.images.push(u); };
  const addSize = s => { s = txt(s).replace(/^(beden|size|numara)\s*:?\s*/i, ""); if (s && s.length <= 12 && !out.sizes.includes(s)) out.sizes.push(s); };
  // "1.249,99 TL" → 1249.99 · "1,249.99" → 1249.99 · "899" → 899
  const num = v => { if (typeof v === "number") return v; let s = (String(v || "").match(/\d[\d.,]*/) || [""])[0].replace(/[.,]$/, ""); if (!s) return null;
    const last = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
    if (last >= 0 && s.length - last - 1 === 2) s = s.slice(0, last).replace(/[.,]/g, "") + "." + s.slice(last + 1);
    else s = s.replace(/[.,]/g, "");
    const n = parseFloat(s); return isFinite(n) && n > 0 ? n : null; };

  // 1) Schema.org product data
  const products = [];
  const collect = j => { if (!j || typeof j !== "object") return; if (Array.isArray(j)) return j.forEach(collect);
    if (j["@graph"]) collect(j["@graph"]);
    const t = [].concat(j["@type"] || []).map(String);
    if (t.some(x => /^(Product|ProductGroup|IndividualProduct|ProductModel)$/i.test(x))) products.push(j);
    if (t.includes("BreadcrumbList")) (j.itemListElement || []).forEach(e => { const n = e.name || (e.item && e.item.name); if (n) out.crumbs.push(txt(n)); }); };
  document.querySelectorAll('script[type="application/ld+json"]').forEach(s => { try { collect(JSON.parse(s.textContent)); } catch (e) {} });
  const offerPrice = o => { if (!o) return null; o = [].concat(o);
    for (const x of o) { const p = num(x.price ?? x.lowPrice ?? (x.priceSpecification && [].concat(x.priceSpecification)[0].price)); if (p) { out.currency = out.currency || x.priceCurrency || ""; return p; } }
    return null; };
  const inStock = o => !o || [].concat(o).some(x => !x.availability || /InStock|PreOrder|LimitedAvailability/i.test(String(x.availability)));
  const p = products[0];
  if (p) {
    out.source.push("product data");
    out.title = txt(p.name); out.desc = txt(p.description).slice(0, 400);
    out.brand = txt(typeof p.brand === "object" && p.brand ? (Array.isArray(p.brand) ? p.brand[0].name : p.brand.name) : p.brand);
    out.sku = txt(p.sku || p.mpn || p.productGroupID || p.productID || "");
    out.colour = txt(p.color || "");
    [].concat(p.image || []).forEach(addImg);
    out.price = offerPrice(p.offers);
    [].concat(p.hasVariant || []).forEach(v => { [].concat(v.image || []).forEach(addImg);
      if (!out.price) out.price = offerPrice(v.offers);
      if (v.size && inStock(v.offers)) addSize(typeof v.size === "object" ? v.size.name : v.size);
      if (!out.colour && v.color) out.colour = txt(v.color); });
  }

  // 2) Shopify stores publish /products/<handle>.js for every product page (same site, public)
  if (/\/products\/[^/?#]+/.test(location.pathname) && (window.Shopify || document.querySelector('link[href*="cdn.shopify"],script[src*="cdn.shopify"]'))) {
    try { const r = await fetch(location.pathname.replace(/\/$/, "") + ".js", { credentials: "same-origin" });
      if (r.ok) { const j = await r.json(); out.source.push("shop product file");
        out.title = out.title || txt(j.title); out.brand = out.brand || txt(j.vendor);
        (j.images || []).forEach(addImg);
        const sizeOpt = (j.options || []).findIndex(o => /size|beden|numara|yaş|age/i.test(typeof o === "string" ? o : o.name));
        const colOpt = (j.options || []).findIndex(o => /colou?r|renk/i.test(typeof o === "string" ? o : o.name));
        const vars = j.variants || []; const cur = new URLSearchParams(location.search).get("variant");
        const sel = vars.find(v => String(v.id) === cur) || vars.find(v => v.available) || vars[0];
        if (sel) { out.price = out.price || sel.price / 100; out.sku = out.sku || txt(sel.sku || j.id);
          if (colOpt >= 0 && !out.colour) out.colour = txt(sel["option" + (colOpt + 1)]); }
        if (sizeOpt >= 0) vars.filter(v => v.available && (colOpt < 0 || !sel || v["option" + (colOpt + 1)] === sel["option" + (colOpt + 1)]))
          .forEach(v => addSize(v["option" + (sizeOpt + 1)]));
      } } catch (e) {}
  }

  // 3) Share tags
  const meta = n => { const el = document.querySelector(`meta[property="${n}"],meta[name="${n}"],meta[itemprop="${n}"]`); return el ? txt(el.getAttribute("content")) : ""; };
  if (!out.title && meta("og:title")) { out.title = meta("og:title"); out.source.push("page tags"); }
  out.brand = out.brand || meta("product:brand") || meta("og:brand");
  if (!out.price) { out.price = num(meta("product:price:amount") || meta("og:price:amount") || meta("price")); out.currency = out.currency || meta("product:price:currency") || meta("og:price:currency"); }
  document.querySelectorAll('meta[property="og:image"],meta[property="og:image:secure_url"],meta[name="twitter:image"]').forEach(m => addImg(m.getAttribute("content")));
  if (!out.desc) out.desc = (meta("og:description") || meta("description")).slice(0, 400);

  // 4) Scan of the page for anything still missing
  if (!out.title) { const h = document.querySelector("h1"); out.title = txt(h ? h.textContent : document.title); out.source.push("page scan"); }
  if (!out.price) { const OLD = /old|eski|strike|line-through|before|original|was|prev|crossed|discount-rate|indirim-oran/i;
    const own = e => { const c = e.cloneNode(true); c.querySelectorAll("del,s,strike,[class]").forEach(x => { if (x.matches("del,s,strike") || OLD.test(x.className + "")) x.remove(); }); return c.textContent; };
    const el = [...document.querySelectorAll('[itemprop="price"],[class*="price" i],[data-price]')]
      .filter(e => !OLD.test(e.className + "") && !e.closest("del,s,strike"))
      .find(e => /\d/.test(e.getAttribute("content") || e.getAttribute("data-price") || own(e)));
    if (el) out.price = num(el.getAttribute("content") || el.getAttribute("data-price") || own(el)); }
  if (!out.sizes.length) {
    const SIZE = /^(\d{2}([.,]5)?|\d{2}\/\d{2}|XXS|XS|S|M|L|XL|XXL|XXXL|[2-5]XL|STD|Standart|Tek Beden|One size|\d{1,2}-\d{1,2}\s?(Ay|Yaş|m|y|months?|years?)|\d{1,2}\s?(Ay|Yaş|m|y))$/i;
    const off = e => /disabled|out|passive|sold|tukendi|tükendi|unavailable|no-stock|nostock/i.test(e.className + " " + (e.getAttribute("aria-disabled") === "true" ? "disabled" : "") + (e.disabled ? " disabled" : ""));
    document.querySelectorAll('[class*="size" i] button,[class*="size" i] li,[class*="size" i] a,[class*="size" i] label,[class*="beden" i] button,[class*="beden" i] li,[class*="beden" i] span,[class*="variant" i] button,[class*="variant" i] li,[data-size],select[name*="size" i] option,select[id*="size" i] option,select[name*="beden" i] option')
      .forEach(e => { const t = txt(e.getAttribute("data-size") || e.textContent); if (SIZE.test(t) && !off(e) && !off(e.parentElement || e)) addSize(t); });
  }
  if (out.images.length < 3) {
    [...document.images].filter(i => (i.naturalWidth || i.width) >= 400 && (i.naturalHeight || i.height) >= 400)
      .sort((a, b) => (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight)).slice(0, 10)
      .forEach(i => addImg(i.currentSrc || i.src));
  }
  if (!out.crumbs.length) document.querySelectorAll('[class*="breadcrumb" i] a,[class*="breadcrumb" i] li').forEach(a => { const t = txt(a.textContent); if (t && t.length < 40 && !out.crumbs.includes(t)) out.crumbs.push(t); });
  if (!out.colour) { const c = [...document.querySelectorAll('[class*="color" i],[class*="renk" i]')].map(e => txt(e.textContent)).find(t => t && t.length < 30 && /^(renk|colou?r)?\s*:?\s*[\p{L} ]+$/iu.test(t));
    if (c) out.colour = c.replace(/^(renk|colou?r)\s*:?\s*/i, ""); }
  out.images = out.images.slice(0, 12);
  if (!out.source.length) out.source.push("page scan");
  return out;
})();
