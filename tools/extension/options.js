const $ = id => document.getElementById(id);
const DEF = { repo: "Fshuaib75/northline-house", branch: "main", token: "" };
const msg = (t, k) => { $("msg").textContent = t; $("msg").className = "status" + (k ? " " + k : ""); };
const read = () => ({ token: $("token").value.trim(), repo: $("repo").value.trim() || DEF.repo, branch: $("branch").value.trim() || DEF.branch });
chrome.storage.local.get("cfg").then(({ cfg }) => { cfg = Object.assign({}, DEF, cfg || {}); $("token").value = cfg.token; $("repo").value = cfg.repo; $("branch").value = cfg.branch; });
$("save").onclick = async () => { await chrome.storage.local.set({ cfg: read() }); msg("Saved.", "good"); };
$("test").onclick = async () => {
  const cfg = read(); if (!cfg.token) { msg("Paste the token first.", "warn"); return; }
  msg("Checking…");
  try {
    const pub = await NLSeal.readPublic(cfg, "inbox-pub.json");
    const inbox = await NLSeal.gh(cfg).getFile("inbox.json");
    const n = inbox.text ? (JSON.parse(inbox.text).batches || []).length : 0;
    if (!pub || !pub.jwk) { msg("Connected, but the inbox lock (inbox-pub.json) is missing: set up the review inbox in your book first.", "warn"); return; }
    msg(`Connected to ${cfg.repo}. Inbox found with ${n} batch${n === 1 ? "" : "es"} waiting. Saving is checked the first time you send.`, "good");
    await chrome.storage.local.set({ cfg });
  } catch (e) { msg(e.message, "bad"); }
};
