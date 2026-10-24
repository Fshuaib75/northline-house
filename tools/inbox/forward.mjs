// Inbox safety net: when a sealed batch lands in inbox.json on `main` by mistake, copy it to the live inbox on
// `gh-pages`, which is the only inbox the owner's book reads. Runs from .github/workflows/inbox-forward.yml.
//
// Batches are copied as opaque objects: nothing is decrypted, and only the batch `id` is read.
// Only batches that are NEW in this push (in `after`, not in `before`) are forwarded. Older batches are never
// re-sent, because the book deletes reviewed batches from gh-pages and re-adding them would bring reviewed items back.
//
//   node tools/inbox/forward.mjs --before <sha> --after <sha> --repo <main checkout> --live <gh-pages inbox.json> [--ledger <file>]
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const ids = inbox => new Set((inbox?.batches || []).map(b => b && b.id).filter(Boolean));

// Pure logic, tested in tools/tests/test_inbox_forward.mjs. `ledger` lists every id forwarded before, so a re-run of
// an old workflow run can never bring back a batch the owner has since reviewed.
export function forward(before, after, live, ledger = []) {
  const was = ids(before), there = ids(live), done = new Set(ledger), seen = new Set();
  const fresh = (after?.batches || []).filter(b => {
    if (!b || typeof b.id !== 'string' || !b.id) return false;
    if (was.has(b.id) || there.has(b.id) || done.has(b.id) || seen.has(b.id)) return false;
    if (typeof b.k !== 'string' || typeof b.iv !== 'string' || typeof b.ct !== 'string') return false;  // not a sealed batch
    seen.add(b.id); return true;
  });
  return {live: {...(live || {}), batches: [...(live?.batches || []), ...fresh]}, added: fresh, ledger: [...ledger, ...fresh.map(b => b.id)]};
}

const ZERO = /^0+$/;
function inboxAt(repo, sha) {
  try { return JSON.parse(execFileSync('git', ['-C', repo, 'show', `${sha}:inbox.json`], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']})); }
  catch { return {batches: []}; }   // no inbox.json at that commit
}

function cli(argv) {
  const arg = name => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
  const [before, after, repo, livePath, ledgerPath] = ['before', 'after', 'repo', 'live', 'ledger'].map(arg);
  if (!before || !after || !repo || !livePath) throw new Error('usage: forward.mjs --before SHA --after SHA --repo DIR --live FILE');
  if (ZERO.test(before)) { console.log('added=0 (no previous commit to compare with: nothing forwarded)'); return 0; }
  const live = fs.existsSync(livePath) ? JSON.parse(fs.readFileSync(livePath, 'utf8')) : {batches: []};
  const ledger = ledgerPath && fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')).forwarded || [] : [];
  const result = forward(inboxAt(repo, before), inboxAt(repo, after), live, ledger);
  if (result.added.length) {
    fs.writeFileSync(livePath, JSON.stringify(result.live));
    if (ledgerPath) fs.writeFileSync(ledgerPath, JSON.stringify({note: 'Inbox batch ids already forwarded from main by .github/workflows/inbox-forward.yml. Never forwarded again.', forwarded: result.ledger}, null, 1) + '\n');
  }
  const items = result.added.reduce((n, b) => n + (Number(b.count) || 0), 0);
  console.log(`added=${result.added.length} items=${items} ids=${result.added.map(b => b.id).join(',')}`);
  return result.added.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { const n = cli(process.argv.slice(2)); if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `added=${n}\n`); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
