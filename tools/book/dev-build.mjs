// Build a LOCAL TEST copy of the owner's book from tools/book/book.template.html, with made-up sample data.
// Usage (repo root):  node tools/book/dev-build.mjs   then serve _dev/ and open /book/
//   e.g.  npx http-server _dev -p 8080   →   http://localhost:8080/book/   (book password: test)
//
// Everything lands in _dev/ (git-ignored): its own prices.json, products.json, private.json, build.json and a review inbox
// sealed with a fresh TEST key pair and the test password. Nothing reads the real sealed files, and the book's GitHub
// saving is pointed at a dead address, so a test run can never write to the live site even if a real key is typed in.
// The real build (catalogue with real buy prices, the password, StatiCrypt) stays private; see tools/book/README.md.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
const { subtle } = globalThis.crypto; const rnd = n => globalThis.crypto.getRandomValues(new Uint8Array(n));
const b64 = u => Buffer.from(u).toString("base64");
const PASS = "test", OUT = "_dev", HERE = "tools/book/";
const sample = JSON.parse(readFileSync(HERE + "sample-data.json", "utf8"));
const config = JSON.parse(readFileSync(HERE + "sample-config.json", "utf8"));
const items = sample.items.map(r => ({ ...r, id: r.ref }));

// same "seal" as the book: PBKDF2(150k, SHA-256) → AES-GCM-256, {v,salt,iv,ct}
async function seal(obj) {
  const salt = rnd(16), iv = rnd(12);
  const km = await subtle.importKey("raw", new TextEncoder().encode(PASS), "PBKDF2", false, ["deriveKey"]);
  const key = await subtle.deriveKey({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" }, km, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  return { v: 1, salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(obj))))) };
}
// old commission rule, as build.py: price = landed + commission + max(minProfit, profitPct% of landed), rounded up, snapped to ₦5k marks
const kg = r => { const t = config.kg[r.cat || "shoes"] || config.kg.shoes; let w = t[r.kind] ?? t.other;
  if ((r.cat || "shoes") === "shoes") { if (r.heel === "Closed" && r.kind === "slide") w = t._clog; if (["Platform", "Wedge", "Heel"].includes(r.heel)) w += t._raised; } return Math.round(w * 100) / 100; };
const priceWith = (L, C) => { let p = Math.ceil((L + C + Math.max(config.minProfit, config.profitPct / 100 * L)) / config.round) * config.round;
  const mark = Math.floor(p / 5000) * 5000; if (mark && p - mark <= config.snapWithin && mark - L - C >= config.snapKeep) p = mark; return p; };
const quote = r => { const L = r.tl * config.rate + config.perKg * kg(r) + config.handling;
  if (r.cat === "baby") return [priceWith(L, config.babyComm), config.babyComm];
  const p = priceWith(L, config.commissionLow); return p <= config.lowThreshold ? [p, config.commissionLow] : [priceWith(L, config.commission), config.commission]; };

rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT + "/book", { recursive: true }); mkdirSync(OUT + "/img", { recursive: true });
copyFileSync("brand/northline-profile.png", OUT + "/img/sample.png");
const BUILD = "dev" + Date.now();
const params = Object.fromEntries(["rate", "perKg", "handling", "minProfit", "profitPct"].map(k => [k, config[k]]));
const prices = Object.fromEntries(items.map(r => [r.ref, quote(r)]));
const w = (f, o) => writeFileSync(`${OUT}/${f}`, JSON.stringify(o, null, 1));
w("prices.json", { updated: new Date().toISOString(), params, menPrice: {}, locked: [], hidden: [], prices });
w("products.json", []); w("build.json", { build: BUILD, items: items.length }); w("drop.json", { week: "", refs: [] });
w("private.json", await seal({}));

// test review inbox: fresh RSA key pair; private key sealed with the test password, like the book's "Set up the review inbox"
const RSA = { name: "RSA-OAEP", hash: "SHA-256" };
const kp = await subtle.generateKey({ ...RSA, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ["encrypt", "decrypt"]);
w("inbox-key.json", await seal({ jwk: await subtle.exportKey("jwk", kp.privateKey) }));
w("inbox-pub.json", { v: 1, alg: "RSA-OAEP-256+A256GCM", jwk: await subtle.exportKey("jwk", kp.publicKey) });
const created = new Date().toISOString(), raw = rnd(32), iv = rnd(12);
const aes = await subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
w("inbox.json", { batches: [{ id: created, created, count: sample.inbox.length,
  k: b64(new Uint8Array(await subtle.encrypt(RSA, kp.publicKey, raw))), iv: b64(iv),
  ct: b64(new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, aes, new TextEncoder().encode(JSON.stringify({ source: "dev sample", created, items: sample.inbox }))))) }] });

let html = readFileSync(HERE + "book.template.html", "utf8");
const LIVE_API = "https://api.github.com/repos/Fshuaib75/northline-house/contents/";
if (!html.includes(LIVE_API)) throw new Error("GitHub API line not found in the template: update dev-build.mjs before testing (safety stop)");
html = html.replace(LIVE_API, "http://127.0.0.1:9/dev-build-no-github/")   // dead address: Publish/Approve fail safely instead of writing to the live repo
  .replace("__DATA__", () => JSON.stringify(items).replace(/<\//g, "<\\/"))
  .replace("__CONFIG__", () => JSON.stringify(config))
  .replace("__BUILD__", BUILD)
  .replace("__STN__", () => JSON.stringify("javascript:alert('Send to Northline bookmarklet (not included in dev builds)')"));
if (/__[A-Z]+__/.test(html)) throw new Error("unfilled placeholder left: " + html.match(/__[A-Z]+__/)[0]);
writeFileSync(OUT + "/book/index.html", html);
console.log(`dev book: ${OUT}/book/index.html  (${items.length} sample styles, ${sample.inbox.length} inbox items, password "${PASS}")`);
console.log(`serve it: npx http-server ${OUT} -p 8080  →  http://localhost:8080/book/`);
