// Popup: read the open product page, prefill the inbox fields, preview the price, queue items, send them sealed.
const G = NLGuess, $ = id => document.getElementById(id);
const DEF = { repo: "Fshuaib75/northline-house", branch: "main", token: "" };
const CAT_LABEL = { shoes: "Shoes", bags: "Bags", baby: "Baby clothes", clothing: "Clothing (abayas, hijabs…)" };
const KIND_LABEL = { slide: "Slide", sandal: "Sandal", flipflop: "Flip-flop", loafer: "Loafer / flat", sneaker: "Sneaker", shoulder: "Shoulder bag", crossbody: "Crossbody", handbag: "Handbag", tote: "Tote",
  clutch: "Clutch", backpack: "Backpack", waist: "Waist bag", dress: "Dress", set: "Set", top: "Top", bodysuit: "Bodysuit", abaya: "Abaya", hijab: "Hijab / scarf", shirt: "Shirt", trousers: "Trousers / skirt", other: "Other" };
const N = n => "₦" + Math.round(n).toLocaleString("en-NG");
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let cfg = DEF, params = null, known = new Set(), page = null, photos = [], keep = new Set(), queue = [], refTouched = false;

const status = (t, kind) => { const s = $("status"); s.textContent = t; s.className = "status" + (kind ? " " + kind : ""); };
const opts = (el, list, label, val) => { el.innerHTML = list.map(v => `<option value="${esc(v)}">${esc(label ? label(v) : v)}</option>`).join(""); if (val != null && list.includes(val)) el.value = val; };
const whoList = cat => cat === "baby" ? ["Girl", "Boy"] : ["Women", "Men"];

async function init() {
  const st = await chrome.storage.local.get(["cfg", "queue"]);
  cfg = Object.assign({}, DEF, st.cfg || {}); queue = st.queue || []; drawQueue();
  NLSeal.readPublic(cfg, "prices.json").then(j => { if (j) { params = j.params || null; known = new Set([...Object.keys(j.prices || {}), ...Object.keys(j.next || {})]); } upd(); }).catch(() => {});
  opts($("cat"), G.CATS, c => CAT_LABEL[c]); opts($("fam"), ["", ...G.FAMS], f => f || "Choose…"); opts($("heel"), G.HEELS, h => h || "Not shoes / not sure");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:/.test(tab.url || "")) { status("Open a product page on a shop’s website, then click the extension again.", "warn"); return; }
  try { const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["extract.js"] }); page = r && r.result; }
  catch (e) { page = null; status("This page can’t be read (" + e.message + "). You can still fill the fields by hand.", "warn"); }
  if (!page) page = { url: tab.url, host: new URL(tab.url).hostname, title: tab.title || "", images: [], sizes: [], crumbs: [], source: [] };
  fill(page);
}

function fill(p) {
  const text = [p.title, (p.crumbs || []).join(" "), p.colour].join(" ");
  const brand = G.canonBrand(p.brand || G.brandFromHost(p.host) || "");
  const cat = G.guessCat(text), who = G.guessFor(cat, text), kind = G.guessKind(cat, text);
  const col = G.guessColour(p.colour, p.title);
  $("brand").value = brand; $("cat").value = cat; catChanged(who, kind);
  $("heel").value = cat === "shoes" ? G.guessHeel(text) : "";
  $("model").value = G.guessModel(p.title, cat, kind);
  $("colour").value = col.colour; $("fam").value = col.fam;
  $("sizes").value = G.cleanSizes(p.sizes, G.lineOf(cat, who), kind).join(", ");
  const tryish = !p.currency || /TRY|TL|₺/i.test(p.currency);
  $("tl").value = p.price && tryish ? p.price : "";
  $("desc").value = "";
  photos = (p.images || []).slice(0, 8); keep = new Set(photos.slice(0, 6)); drawPhotos();
  refTouched = false; autoRef();
  const from = (p.source || []).join(", ");
  status(`${brand || p.host} · ${p.title ? p.title.slice(0, 70) : "no title found"}${from ? " · read from " + from : ""}`);
  if (p.price && !tryish) $("err").hidden = false, $("err").textContent = `The page price is in ${p.currency}: type the lira price yourself.`;
  if (!p.title && !photos.length) status("Couldn’t find product details on this page. Fill the fields by hand, or open the product’s own page.", "warn");
  $("form").hidden = false; upd();
}

function catChanged(who, kind) {
  const cat = $("cat").value;
  opts($("who"), whoList(cat), null, who || $("who").value);
  opts($("kind"), G.KINDS[cat], k => KIND_LABEL[k] || k, kind || $("kind").value);
  $("heelBox").hidden = cat !== "shoes"; if (cat !== "shoes") $("heel").value = "";
}

function drawPhotos() {
  const first = photos.find(u => keep.has(u));
  $("photos").innerHTML = photos.map((u, i) => `<button data-i="${i}" aria-pressed="${keep.has(u)}" title="${keep.has(u) ? "Included: tap to leave out" : "Left out: tap to include"}"><img src="${esc(u)}" alt="" referrerpolicy="no-referrer">${u === first ? '<span class="main">Main</span>' : ""}</button>`).join("");
  $("photoHint").textContent = photos.length ? `${keep.size} of ${photos.length} photos kept. The first kept photo is the main one.` : "No photos found on this page.";
}
$("photos").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; const u = photos[+b.dataset.i]; keep.has(u) ? keep.delete(u) : keep.add(u); drawPhotos(); });

function autoRef() { if (refTouched) return; $("ref").value = G.makeRef($("brand").value, page && page.sku, page && page.url, $("colour").value); dupCheck(); }
function dupCheck() { const r = $("ref").value.trim().toUpperCase(), inQ = queue.some(q => q.ref === r);
  const inCat = known.has(r) || known.has(r.replace(/^[A-Z]+-/, ""));   // Capone refs in the catalogue have no brand code
  $("dup").hidden = !(inCat || inQ);
  $("dup").textContent = inCat ? "This reference is already in your catalogue. Change it if this is a different colour or style." : inQ ? "Already on your list below: adding again replaces it." : ""; }

function num(v) { const n = parseFloat(String(v || "").replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")); return isFinite(n) && n > 0 ? n : 0; }
function weight() { const k = num($("kg").value); if (k) return { kg: k, typed: true }; const kind = $("kind").value, cat = $("cat").value; return { kg: G.KG[kind] && cat === "clothing" ? G.KG[kind] : G.KG[cat], typed: false }; }
function upd() {
  const tl = num($("tl").value), w = weight(), e = G.estimate(tl, w.kg, params);
  if (!e) { $("est").hidden = true; return; }
  const thin = e.profit < 5000, steep = e.price > 65000;
  $("est").hidden = false; $("est").className = "est" + (thin ? " thin" : "");
  $("est").innerHTML = `<div class="p">≈ ${N(e.price)}<span>agent ${N(e.agent)}</span></div>
    <small>Your profit ≈ ${N(e.profit)} · landed ${N(e.landed)} (goods ${N(e.goods)} + freight ${N(e.freight)} for ${w.kg} kg${w.typed ? "" : " est."} + handling ${N(e.handling)})</small>
    ${thin ? `<small class="flag">Thin: under ₦5,000 profit per piece.</small>` : ""}${steep ? `<small class="flag">Above ₦65k: most of your buyers spend ₦20k–50k.</small>` : ""}
    <small>Preview with your book’s settings${params ? "" : " (defaults: settings not loaded)"}. The book sets the final price.</small>`;
}
["tl", "kg", "kind", "cat"].forEach(id => $(id).addEventListener("input", upd));
$("cat").addEventListener("change", () => { catChanged(); $("sizes").value = G.cleanSizes([], G.lineOf($("cat").value, $("who").value), $("kind").value).join(", "); upd(); });
$("who").addEventListener("change", () => { const cat = $("cat").value; if (cat === "shoes") $("sizes").value = G.cleanSizes([], G.lineOf(cat, $("who").value)).join(", "); });
["brand", "colour"].forEach(id => $(id).addEventListener("input", autoRef));
$("colour").addEventListener("change", () => { const g = G.guessColour($("colour").value, ""); if (g.fam && !$("fam").value) $("fam").value = g.fam; });
$("ref").addEventListener("input", () => { refTouched = true; dupCheck(); });

function buildItem() {
  const cat = $("cat").value, who = $("who").value, g = G.lineOf(cat, who), kept = photos.filter(u => keep.has(u));
  const it = { t: "new", ref: $("ref").value.trim().toUpperCase().replace(/\s+/g, "-"), brand: $("brand").value.trim(), cat, g,
    model: $("model").value.trim(), colour: $("colour").value.trim(), fam: $("fam").value, desc: $("desc").value.trim(),
    kind: $("kind").value, heel: cat === "shoes" ? $("heel").value : "", tl: num($("tl").value),
    img: kept[0] || "", imgs: kept, sizes: $("sizes").value.split(",").map(s => s.trim()).filter(Boolean), page: page ? page.url : "" };
  if (cat !== "shoes") it.for = who;
  const k = num($("kg").value); if (k) it.kg = k;
  const miss = [!it.model && "model name", !it.brand && "brand", !it.tl && "lira price", !it.img && "at least one photo", !it.fam && "colour group", !it.sizes.length && "sizes", !it.ref && "reference"].filter(Boolean);
  return { it, miss };
}
$("add").onclick = async () => {
  const { it, miss } = buildItem();
  if (miss.length) { $("err").hidden = false; $("err").textContent = "Add " + miss.join(", ") + "."; return; }
  $("err").hidden = true;
  queue = queue.filter(q => q.ref !== it.ref).concat(it); await chrome.storage.local.set({ queue }); drawQueue(); dupCheck();
  status(`Added ${it.model}${it.colour ? " · " + it.colour : ""}. Open the next product and click the extension again.`, "good");
};

function drawQueue() {
  $("queueBox").hidden = !queue.length; $("qCount").textContent = queue.length ? `(${queue.length})` : "";
  $("send").textContent = `Send ${queue.length} to review inbox`; $("send").hidden = false;
  $("queue").innerHTML = queue.map((q, i) => { const e = G.estimate(q.tl, q.kg || (q.cat === "clothing" && G.KG[q.kind]) || G.KG[q.cat], params);
    return `<div class="qi"><img src="${esc(q.img)}" alt="" referrerpolicy="no-referrer"><div><b>${esc(q.model)} · ${esc(q.colour)}</b><small>${esc(q.brand)} · ₺${q.tl}${e ? " → ≈ " + N(e.price) : ""} · ${esc(q.ref)}</small></div><button class="x" data-i="${i}" aria-label="Remove">✕</button></div>`; }).join("");
}
$("queue").addEventListener("click", async e => { const b = e.target.closest(".x"); if (!b) return; queue.splice(+b.dataset.i, 1); await chrome.storage.local.set({ queue }); drawQueue(); dupCheck(); });
$("clear").onclick = async () => { if (!confirm(`Remove all ${queue.length} items from the list?`)) return; queue = []; await chrome.storage.local.set({ queue }); drawQueue(); dupCheck(); };
$("download").onclick = () => {
  const blob = new Blob([JSON.stringify({ source: "Add to Northline (browser)", items: queue }, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "findings.json"; a.click();
  $("sendHint").textContent = "Saved findings.json. Seal it from the repo folder with: node tools/seal-inbox.mjs findings.json";
};
$("send").onclick = async () => {
  if (!queue.length) return;
  if (!cfg.token) { $("sendHint").innerHTML = 'Add your GitHub token in <a href="options.html" target="_blank">Settings</a> first, or use “Download findings”.'; return; }
  $("send").disabled = true; $("send").textContent = "Sealing and sending…";
  try {
    const r = await NLSeal.sendToInbox(cfg, queue);
    const n = queue.length; queue = []; await chrome.storage.local.set({ queue }); drawQueue();
    const [owner, repo] = cfg.repo.split("/");
    status(`Sent ${n} item${n === 1 ? "" : "s"} to your review inbox (${r.waiting} batch${r.waiting === 1 ? "" : "es"} waiting).`, "good");
    $("sendHint").innerHTML = `Open your book → To review in a minute or two (the site takes a moment to update): <a href="https://${owner.toLowerCase()}.github.io/${repo}/book/" target="_blank">open book</a>.`;
    $("queueBox").hidden = false; $("queue").innerHTML = ""; $("send").hidden = true;
  } catch (e) { $("sendHint").textContent = e.message; status("Not sent. Your list is kept.", "bad"); }
  finally { $("send").disabled = false; if (queue.length) $("send").textContent = `Send ${queue.length} to review inbox`; }
};
init();
