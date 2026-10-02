// Turns what the page says (often in Turkish) into the review-inbox fields, and estimates the Nigeria price.
// Pure functions: no page access, no network. Everything it guesses stays editable in the popup.
(function (root) {
  const low = s => String(s || "").toLocaleLowerCase("tr");
  const has = (t, words) => words.some(w => t.includes(w));

  const CATS = ["shoes", "bags", "baby", "clothing"];
  const KINDS = {
    shoes: ["slide", "sandal", "flipflop", "loafer", "sneaker", "other"],
    bags: ["shoulder", "crossbody", "handbag", "tote", "clutch", "backpack", "waist", "other"],
    baby: ["dress", "set", "top", "bodysuit", "other"],
    clothing: ["abaya", "hijab", "dress", "shirt", "trousers", "set", "top", "other"]
  };
  const FAMS = ["Black", "Brown", "Tan & camel", "Beige & nude", "White", "Metallic", "Red & burgundy", "Pink & purple", "Blue", "Green & khaki", "Orange & yellow", "Grey", "Print & multi"];
  const HEELS = ["", "Flat", "Low heel", "Wedge", "Platform", "Heel", "Closed"];
  // shipping weight per piece, kg, packed (your own scale beats these: type it in the popup)
  const KG = { shoes: 0.65, bags: 0.7, baby: 0.4, clothing: 0.5, hijab: 0.15, abaya: 0.6, shirt: 0.3, trousers: 0.4, set: 0.6, dress: 0.5, top: 0.25 };

  function guessCat(text) {
    const t = low(text);
    if (has(t, ["bebek", "baby", "zıbın", "tulum bebek", "yenidoğan", "newborn", "0-3 ay", "3-6 ay"])) return "baby";
    if (has(t, ["çanta", "canta", " bag", "bag ", "clutch", "sırt çant", "cüzdan", "backpack", "tote"])) return "bags";
    if (has(t, ["ayakkabı", "ayakkabi", "terlik", "sandalet", "babet", "loafer", "makosen", "sneaker", "bot ", "çizme", "parmak arası", "slipper", "shoe", "sandal", "mule", "espadril"])) return "shoes";
    if (has(t, ["abaya", "ferace", "kap ", "tesettür", "eşarp", "esarp", "şal", "hijab", "elbise", "gömlek", "pantolon", "tunik", "takım", "dress", "shirt", "trouser", "tişört", "bluz", "etek", "kimono"])) return "clothing";
    return "shoes";
  }
  function guessFor(cat, text) {
    const t = low(text);
    const men = has(t, ["erkek", " men", "men's", "mens", "bay "]), women = has(t, ["kadın", "kadin", "women", "bayan", "kız", "girl"]);
    if (cat === "baby") return has(t, ["kız", "girl"]) ? "Girl" : has(t, ["erkek", "boy"]) ? "Boy" : "Girl";
    return men && !women ? "Men" : "Women";
  }
  // line (tab) on the site: W women's shoes · M men's shoes · B baby · BG bags · CL clothing
  const lineOf = (cat, who) => cat === "bags" ? "BG" : cat === "baby" ? "B" : cat === "clothing" ? "CL" : who === "Men" ? "M" : "W";
  function guessKind(cat, text) {
    const t = low(text);
    const R = {
      shoes: [["flipflop", ["parmak arası", "flip flop", "flip-flop"]], ["slide", ["terlik", "slide", "mule", "slipper"]], ["sandal", ["sandalet", "sandal"]],
        ["loafer", ["loafer", "makosen", "babet", "oxford", "klasik"]], ["sneaker", ["sneaker", "spor ayakkabı", "spor ayakkabi", "günlük ayakkabı", "trainer"]]],
      bags: [["backpack", ["sırt", "backpack"]], ["waist", ["bel çanta", "waist", "bum bag"]], ["crossbody", ["çapraz", "crossbody", "postacı"]], ["clutch", ["clutch", "portföy", "abiye çanta", "el portföy"]],
        ["tote", ["tote", "plaj", "alışveriş", "shopper"]], ["shoulder", ["omuz", "shoulder", "baget", "hobo"]], ["handbag", ["el çanta", "handbag", "kol çanta"]]],
      baby: [["bodysuit", ["body", "zıbın", "tulum", "romper", "bodysuit"]], ["set", ["takım", "set", "2'li", "3'lü", "2li", "3lü"]], ["dress", ["elbise", "dress"]], ["top", ["tişört", "t-shirt", "bluz", "sweat", "top"]]],
      clothing: [["abaya", ["abaya", "ferace", "kap ", "pardesü"]], ["hijab", ["eşarp", "esarp", "şal", "hijab", "bone", "türban"]], ["set", ["takım", "set", "ikili"]],
        ["dress", ["elbise", "dress", "tunik"]], ["shirt", ["gömlek", "shirt"]], ["trousers", ["pantolon", "trouser", "pants", "şalvar", "etek"]], ["top", ["tişört", "t-shirt", "bluz", "kazak", "polo"]]]
    };
    for (const [k, words] of R[cat] || []) if (has(t, words)) return k;
    return "other";
  }
  function guessHeel(text) {
    const t = low(text);
    if (has(t, ["dolgu", "wedge"])) return "Wedge";
    if (has(t, ["platform"])) return "Platform";
    if (has(t, ["stiletto", "yüksek topuk", "topuklu", "heel"])) return has(t, ["kısa topuk", "alçak", "low heel", "kitten"]) ? "Low heel" : "Heel";
    if (has(t, ["kısa topuk", "low heel"])) return "Low heel";
    if (has(t, ["kapalı", "closed"])) return "Closed";
    if (has(t, ["düz", "flat", "terlik", "sandalet", "babet"])) return "Flat";
    return "";
  }
  // Turkish / English colour words → [English colour, colour group]
  const COLOURS = [
    [["siyah", "black"], "Black", "Black"], [["lacivert", "navy"], "Navy", "Blue"], [["kahverengi", "kahve", "brown", "kakao", "çikolata"], "Brown", "Brown"],
    [["taba", "camel", "tan", "konyak", "cognac", "hardal"], "Tan", "Tan & camel"], [["bej", "beige", "nude", "ten", "krem", "cream", "vizon", "stone", "ekru", "ecru"], "Beige", "Beige & nude"],
    [["beyaz", "white", "kırık beyaz", "off white"], "White", "White"], [["gümüş", "silver"], "Silver", "Metallic"], [["altın", "gold", "bronz", "bronze", "metalik"], "Gold", "Metallic"],
    [["bordo", "burgundy", "kırmızı", "red", "vişne"], "Burgundy", "Red & burgundy"], [["pembe", "pink", "pudra", "powder", "fuşya", "lila", "mor", "purple", "lilac"], "Pink", "Pink & purple"],
    [["mavi", "blue", "indigo", "petrol", "turkuaz"], "Blue", "Blue"], [["yeşil", "green", "haki", "khaki", "zeytin", "olive", "mint"], "Green", "Green & khaki"],
    [["turuncu", "orange", "sarı", "yellow", "somon"], "Orange", "Orange & yellow"], [["gri", "grey", "gray", "füme", "antrasit"], "Grey", "Grey"],
    [["desenli", "çok renkli", "multi", "print", "leopar", "leopard", "çiçekli", "floral", "zebra", "ekose"], "Print", "Print & multi"]
  ];
  function guessColour(colour, text) {
    const c = low(colour), t = low(text);
    for (const src of [c, t]) { if (!src) continue;
      for (const [words, en, fam] of COLOURS) if (words.some(w => new RegExp("(^|[^\\p{L}])" + w + "([^\\p{L}]|$)", "u").test(src))) {
        const exact = { navy: "Navy", lacivert: "Navy", "kırık beyaz": "Off-white", "off white": "Off-white", pudra: "Powder pink", lila: "Lilac", mor: "Purple", haki: "Khaki", khaki: "Khaki", zeytin: "Olive", vizon: "Mink", krem: "Cream", ekru: "Ecru", taba: "Tan", konyak: "Cognac", hardal: "Mustard", füme: "Smoke grey", antrasit: "Anthracite", leopar: "Leopard", bordo: "Burgundy", kırmızı: "Red", sarı: "Yellow", bronz: "Bronze", altın: "Gold" };
        const hit = Object.keys(exact).find(k => src.includes(k)); return { colour: hit ? exact[hit] : en, fam };
      } }
    return { colour: colour ? String(colour).replace(/^./, m => m.toUpperCase()) : "", fam: "" };
  }
  const MATERIALS = [["hakiki deri", "Genuine leather"], ["gerçek deri", "Genuine leather"], ["suni deri", "Faux leather"], ["süet", "Suede"], ["nubuk", "Nubuck"], ["rugan", "Patent"],
    ["deri", "Leather"], ["hasır", "Straw"], ["keten", "Linen"], ["pamuk", "Cotton"], ["şifon", "Chiffon"], ["krep", "Crepe"], ["saten", "Satin"], ["ipek", "Silk"], ["triko", "Knit"], ["kot", "Denim"], ["tekstil", "Fabric"]];
  const KIND_EN = { slide: "slide", sandal: "sandal", flipflop: "flip-flop", loafer: "loafer", sneaker: "sneaker", shoulder: "shoulder bag", crossbody: "crossbody bag", handbag: "handbag", tote: "tote bag",
    clutch: "clutch", backpack: "backpack", waist: "waist bag", dress: "dress", set: "set", top: "top", bodysuit: "bodysuit", abaya: "abaya", hijab: "hijab", shirt: "shirt", trousers: "trousers", other: "" };
  function guessModel(text, cat, kind) {
    const t = low(text); const mat = (MATERIALS.find(([w]) => t.includes(w)) || [])[1] || "";
    const extra = has(t, ["tokalı", "toka", "buckle"]) ? "buckle " : has(t, ["iki bant", "çift bant", "2 bant", "double strap"]) ? "two-strap " : has(t, ["kemerli"]) ? "belted " : has(t, ["oversize"]) ? "oversized " : "";
    const k = KIND_EN[kind] || (cat === "shoes" ? "shoe" : cat === "bags" ? "bag" : "piece");
    const m = (mat ? mat + " " + extra + k : extra + k).trim(); return m ? m[0].toUpperCase() + m.slice(1) : "";
  }
  const CODES = { "u.s. polo assn.": "USPA", "us polo": "USPA", "beverly hills polo club": "BHPC", slazenger: "SLZ", sivarro: "SIV", capone: "CAP", "capone outfitters": "CAP", gezer: "GEZ",
    "hammer jack": "HJ", lumberjack: "LMB", kinetix: "KNX", polaris: "PLR", "pierre cardin": "PC", defacto: "DFC", bambi: "BMB", "lc waikiki": "LCW", "e-bebek": "EBB", hotiç: "HTC", hotic: "HTC", derimod: "DRM", desa: "DESA", marjin: "MRJ", modanisa: "MDN", armine: "ARM", aker: "AKR", kayra: "KYR", tudors: "TDR" };
  function brandCode(brand) { const b = low(brand).trim(); if (CODES[b]) return CODES[b];
    const w = b.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean); if (!w.length) return "NL";
    const ascii = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9]/gi, "").toUpperCase();
    return w.length > 1 ? w.map(x => ascii(x)[0] || "").join("").slice(0, 4) : ascii(w[0]).slice(0, 4); }
  const COLCODE = { Black: "BLK", Navy: "NVY", Brown: "BRN", Tan: "TAN", Beige: "BGE", White: "WHT", "Off-white": "OWH", Silver: "SLV", Gold: "GLD", Burgundy: "BRD", Red: "RED", Pink: "PNK", "Powder pink": "PWD",
    Lilac: "LLC", Purple: "PRP", Blue: "BLU", Green: "GRN", Khaki: "KHK", Olive: "OLV", Orange: "ORG", Yellow: "YLW", Mustard: "MST", Grey: "GRY", "Smoke grey": "SMK", Anthracite: "ANT", Print: "PRT", Leopard: "LEO", Cream: "CRM", Mink: "MNK", Ecru: "ECR", Cognac: "CGN", Bronze: "BRZ" };
  function makeRef(brand, sku, url, colour) {
    let code = String(sku || "").toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 14);
    if (!code) { const m = String(url || "").match(/(\d{5,})/g); code = m ? m[m.length - 1].slice(-10) : String(Date.now()).slice(-6); }
    const cc = COLCODE[colour] || String(colour || "").normalize("NFD").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "MIX";
    return [brandCode(brand), code, cc].join("-");
  }
  // match the brand names already used in the catalogue, so one brand doesn't show up twice on the site
  const CANON = { "capone outfitters": "Capone", capone: "Capone", "u.s. polo assn": "U.S. Polo Assn.", "u.s. polo assn.": "U.S. Polo Assn.", "us polo assn": "U.S. Polo Assn.", "us polo": "U.S. Polo Assn.",
    defacto: "DeFacto", "beverly hills polo club": "Beverly Hills Polo Club", slazenger: "Slazenger", sivarro: "Sivarro", gezer: "Gezer", bambi: "Bambi", "hammer jack": "Hammer Jack", lumberjack: "Lumberjack",
    kinetix: "Kinetix", polaris: "Polaris", "pierre cardin": "Pierre Cardin", hotic: "Hotiç", hotiç: "Hotiç", "lc waikiki": "LC Waikiki", lcw: "LC Waikiki", ebebek: "e-bebek", "e-bebek": "e-bebek" };
  const canonBrand = b => { const k = low(b).trim(); return CANON[k] || String(b || "").trim(); };
  function brandFromHost(host) { const h = String(host || "").replace(/^www\./, "").split(".")[0]; const map = { caponeoutfitters: "Capone", uspoloassn: "U.S. Polo Assn.", slazenger: "Slazenger", sivarro: "Sivarro", hotic: "Hotiç", derimod: "Derimod", desa: "DESA", lcwaikiki: "LC Waikiki", defacto: "DeFacto", "e-bebek": "e-bebek", ebebek: "e-bebek", modanisa: "Modanisa", armine: "Armine", aker: "Aker", kayra: "Kayra", gezer: "Gezer", marjin: "Marjin", tudors: "Tudors" };
    return map[h] || ""; }
  const SIZE_DEFAULT = { W: ["36", "37", "38", "39", "40", "41"], M: ["40", "41", "42", "43", "44", "45"], B: ["0-3m", "3-6m", "6-9m", "9-12m", "12-18m", "18-24m"], BG: ["One size"], CL: ["S", "M", "L", "XL"] };
  // Turkish baby/clothing sizes → the site's labels
  function cleanSizes(list, line, kind) {
    const out = [];
    for (let s of list || []) { s = String(s).trim();
      let m = s.match(/^(\d{1,2})\s*-\s*(\d{1,2})\s*(ay|m|months?)$/i); if (m) s = `${m[1]}-${m[2]}m`;
      m = s.match(/^(\d{1,2})\s*-\s*(\d{1,2})\s*(yaş|y|years?)$/i); if (m) s = `${m[1]}-${m[2]}y`;
      m = s.match(/^(\d{1,2})\s*(yaş|y|years?)$/i); if (m) s = `${m[1]}y`;
      if (/^(std|standart|tek beden|one size)$/i.test(s)) s = "One size";
      s = s.replace(",", ".");
      if (!out.includes(s)) out.push(s); }
    if (!out.length) return line === "CL" && kind === "hijab" ? ["One size"] : (SIZE_DEFAULT[line] || ["One size"]).slice();
    return out;
  }
  // Price estimate with your book's settings (prices.json → params). The book still sets the final price: this is a preview.
  // landed = lira × rate + kg × per-kg freight + handling · your profit = the bigger of min profit and profit % of landed
  // agent = a quarter of the margin (your profit + agent), rounded up to ₦500 · price rounded up to ₦500
  function estimate(tl, kg, params) {
    const P = Object.assign({ rate: 30, perKg: 12000, handling: 1500, minProfit: 4000, profitPct: 15 }, params || {});
    if (!(tl > 0) || !(kg > 0)) return null;
    const goods = tl * P.rate, freight = kg * P.perKg, landed = goods + freight + P.handling;
    const profit = Math.max(P.minProfit, landed * P.profitPct / 100);
    let agent = 0; for (let k = 0; k < 6; k++) agent = Math.ceil(0.25 * (profit + agent) / 500) * 500;
    const price = Math.ceil((landed + profit + agent) / 500) * 500;
    return { goods, freight, handling: P.handling, landed, profit: price - landed - agent, agent, price, freightShare: freight / landed };
  }
  const api = { CATS, KINDS, FAMS, HEELS, KG, guessCat, guessFor, lineOf, guessKind, guessHeel, guessColour, guessModel, brandCode, makeRef, brandFromHost, canonBrand, cleanSizes, estimate, SIZE_DEFAULT };
  root.NLGuess = api; if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
