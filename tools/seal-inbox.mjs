// Seal a batch of findings for the owner's review inbox.
// Usage: node tools/seal-inbox.mjs findings.json   (run from the repo root)
// findings.json = {"source":"weekly robot","items":[...]}  — see tools/INBOX-FORMAT.md
// Uses ONLY the public key (inbox-pub.json): it can lock, never unlock. Only the owner's book holds the private key.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const { subtle } = globalThis.crypto; const getRandomValues = a => globalThis.crypto.getRandomValues(a);
const b64 = u => Buffer.from(u).toString("base64");
const file = process.argv[2];
if (!file) { console.error("usage: node tools/seal-inbox.mjs findings.json"); process.exit(1); }
if (!existsSync("inbox-pub.json")) { console.error("inbox-pub.json missing: the owner has not set up the review inbox yet (book → To review → Set up)."); process.exit(2); }
const findings = JSON.parse(readFileSync(file, "utf8"));
if (!Array.isArray(findings.items)) { console.error("findings.items must be an array"); process.exit(1); }
const created = new Date().toISOString();
const plain = new TextEncoder().encode(JSON.stringify({ ...findings, created }));
const pub = await subtle.importKey("jwk", JSON.parse(readFileSync("inbox-pub.json", "utf8")).jwk, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
const raw = getRandomValues(new Uint8Array(32)), iv = getRandomValues(new Uint8Array(12));
const aes = await subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
const batch = { id: created, created, count: findings.items.length,
  k: b64(new Uint8Array(await subtle.encrypt({ name: "RSA-OAEP" }, pub, raw))), iv: b64(iv),
  ct: b64(new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, aes, plain))) };
const inbox = existsSync("inbox.json") ? JSON.parse(readFileSync("inbox.json", "utf8")) : { batches: [] };
inbox.batches = [...(inbox.batches || []), batch];
writeFileSync("inbox.json", JSON.stringify(inbox));
console.log(`sealed ${findings.items.length} item(s) into inbox.json (batch ${created}); ${inbox.batches.length} batch(es) waiting`);
