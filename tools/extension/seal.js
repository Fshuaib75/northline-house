// Seals a batch for the review inbox (same lock as tools/seal-inbox.mjs: only your book's private key can open it)
// and adds it to inbox.json in your repo through the GitHub API, using the token you saved in Settings.
(function (root) {
  const b64 = bytes => { let s = ""; const u = new Uint8Array(bytes); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const utf8b64 = str => b64(new TextEncoder().encode(str));
  const unb64utf8 = s => new TextDecoder().decode(Uint8Array.from(atob(String(s).replace(/\s/g, "")), c => c.charCodeAt(0)));

  async function seal(findings, jwk) {
    if (!findings || !Array.isArray(findings.items)) throw new Error("findings.items must be a list");
    const created = new Date().toISOString();
    const plain = new TextEncoder().encode(JSON.stringify({ ...findings, created }));
    const pub = await crypto.subtle.importKey("jwk", jwk, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
    const raw = crypto.getRandomValues(new Uint8Array(32)), iv = crypto.getRandomValues(new Uint8Array(12));
    const aes = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
    return { id: created, created, count: findings.items.length,
      k: b64(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, pub, raw)), iv: b64(iv),
      ct: b64(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, plain)) };
  }

  function gh(cfg) {
    const base = `https://api.github.com/repos/${cfg.repo}/contents/`;
    const head = () => Object.assign({ Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }, cfg.token ? { Authorization: "Bearer " + cfg.token } : {});
    async function getFile(path) {
      const r = await fetch(base + path + "?ref=" + encodeURIComponent(cfg.branch) + "&t=" + Date.now(), { headers: head(), cache: "no-store" });
      if (r.status === 404) return { sha: null, text: null };
      if (!r.ok) throw new Error(await why(r, "read " + path));
      const j = await r.json(); let content = j.content;
      if (!content && j.git_url) { const b = await fetch(j.git_url, { headers: head() }); if (!b.ok) throw new Error(await why(b, "read " + path)); content = (await b.json()).content; }
      return { sha: j.sha, text: unb64utf8(content || "") };
    }
    async function putFile(path, text, sha, message) {
      const r = await fetch(base + path, { method: "PUT", headers: Object.assign({ "Content-Type": "application/json" }, head()),
        body: JSON.stringify(Object.assign({ message, content: utf8b64(text), branch: cfg.branch }, sha ? { sha } : {})) });
      if (r.status === 409 || r.status === 422) return { conflict: true };
      if (!r.ok) throw new Error(await why(r, "save " + path));
      return { ok: true, commit: (await r.json()).commit };
    }
    return { getFile, putFile };
  }
  async function why(r, what) { let m = ""; try { m = (await r.json()).message || ""; } catch (e) {}
    if (r.status === 401) return "GitHub didn’t accept the token. Make a new one in Settings.";
    if (r.status === 403 || r.status === 404) return `GitHub refused to ${what}. Check the token can read and write “Contents” on northline-house${m ? " (" + m + ")" : ""}.`;
    return `Couldn’t ${what} (${r.status}${m ? ": " + m : ""}).`; }

  // public files of the site (no token needed): the inbox lock and the pricing settings
  async function readPublic(cfg, path) {
    if (cfg.token) { const f = await gh(cfg).getFile(path); return f.text == null ? null : JSON.parse(f.text); }
    const r = await fetch(`https://raw.githubusercontent.com/${cfg.repo}/${cfg.branch}/${path}?t=${Date.now()}`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  }

  async function sendToInbox(cfg, items) {
    if (!cfg.token) throw new Error("Add your GitHub token in Settings first, or use “Download findings”.");
    const pubFile = await readPublic(cfg, "inbox-pub.json");
    if (!pubFile || !pubFile.jwk) throw new Error("inbox-pub.json is missing: set up the review inbox in your book first (To review → Set up).");
    const batch = await seal({ source: "Add to Northline (browser)", items }, pubFile.jwk);
    const api = gh(cfg);
    for (let attempt = 0; attempt < 3; attempt++) {
      const f = await api.getFile("inbox.json");
      const inbox = f.text ? JSON.parse(f.text) : { batches: [] };
      inbox.batches = [...(inbox.batches || []), batch];
      const res = await api.putFile("inbox.json", JSON.stringify(inbox), f.sha, `Add to Northline: ${items.length} item${items.length === 1 ? "" : "s"} for review`);
      if (res.ok) return { batch, waiting: inbox.batches.length, commit: res.commit };
      await new Promise(r => setTimeout(r, 800 * (attempt + 1)));   // someone else saved inbox.json at the same moment: read it again and retry
    }
    throw new Error("inbox.json kept changing while saving. Try again in a minute.");
  }

  const api = { seal, gh, readPublic, sendToInbox, utf8b64, unb64utf8 };
  root.NLSeal = api; if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
