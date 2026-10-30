# The owner's book: source and local testing

`book/index.html` on the live site is the owner's private book (catalogue with buy prices, To review, Add, Prices). It is **built and then password-encrypted** with StatiCrypt, so the repo only ever held the encrypted page. This folder holds the book's **source code** so it can be changed through normal pull requests.

| File | What it is |
|---|---|
| `book.template.html` | The book's full source (HTML, CSS, JS). Same as the live book (last rebuilt 17 Oct 2026, commit `cf0e0f4` on gh-pages). Code only: no buy prices, no catalogue, no password, no key. |
| `dev-build.mjs` | Builds a local **test** copy into `_dev/` (git-ignored) with made-up data. |
| `sample-data.json` | Made-up catalogue items and review-inbox items for testing. Not real products or prices. |
| `sample-config.json` | Pricing settings for the test build (same shape as the private config). |

## Placeholders the real build fills in

| Placeholder | Filled with |
|---|---|
| `__DATA__` | The full catalogue, **including buy prices** (`tl`). This is why the built book must stay encrypted. |
| `__CONFIG__` | Pricing settings (rate, freight per kg, handling, profit, commission, weights). |
| `__BUILD__` | Build stamp; the book shows "reload" when `build.json` on the site has a newer one. |
| `__STN__` | The "Send to Northline" bookmarklet. |

Keep each placeholder exactly once, and keep the GitHub API line (`const GH="https://api.github.com/repos/Fshuaib75/northline-house/contents/"`) as one literal string, because `dev-build.mjs` swaps it out for safety and stops if it can't find it.

## Test locally

```
node tools/book/dev-build.mjs
npx http-server _dev -p 8080        # or: python3 -m http.server 8080 -d _dev
```

Open `http://localhost:8080/book/`. To review asks for the book password: in the test build it is `test`. The inbox holds 2 new styles (3 colours), 1 price change and 1 sold-out item. The Men tab shows 3 sample styles.

`_dev/` has its own `prices.json`, `products.json`, `private.json`, `build.json`, and a review inbox sealed with a fresh **test** key pair, so nothing reads the real sealed files. The book's GitHub saving points at a dead address in the test build, so **Approve, Publish and Add fail with "Couldn't save"** instead of writing to the live site, even if a real key is typed in. To test code that runs after a save, stub `ghPut`/`ghGet` in your test instead of pointing the test build at GitHub.

Test at phone (390 px) and desktop widths. The owner uses the book mostly on his phone.

## Private decision capture

`node --test tools/book/decisions.test.mjs` checks the standalone template's feature vectors against `tools/sourcing/ranking.mjs` and the sourcing estimate, plus successful/failed review saves, retries, encryption and published hides. It uses made-up fixtures and stubbed remote writes only.

Only taste decisions save VERSION 1 training rows: new-style approvals/dismissals and manual hides when Publish succeeds. Price changes and sold-out updates never become rows, whether approved or dismissed. Supply hides stay marked in local pending state across failed saves/reloads so a later Publish cannot turn them into taste rejections. Missing sizes count as zero coverage; no sizes are invented. Group keys use `grp` or ref, and a later decision reuses that ref's recorded group on this device. Source and original batch identity survive inbox resealing.

Capture is best-effort and must never block Publish, Approve or Dismiss. Missing passwords, unknown costs, encryption/storage errors or failed confirmation skip the affected rows and show a cumulative count in `decisionNote`. Other valid rows in the selection are still captured. This changes only decision capture: the underlying action's own password and save requirements still apply.

History lives only in this origin's `localStorage["nl-decisions-v1"]`, encrypted with the existing book-password AES-GCM/PBKDF2 helper. No history is sent to GitHub or any public data file. The existing book also remembers its password on this device: encryption does **not** protect against someone with access to an unlocked book, same-origin scripts, or the browser profile and saved password. Different browsers/devices do not sync. A changed password cannot open old history; export before changing it or clearing browser data.

**Export decisions** downloads private JSON with `decisions` in the schema `engine.mjs train` reads. The file contains cost-derived features; keep it private and never commit it. A snapshot is encrypted before remote writes and confirmed only after the relevant save succeeds. Failed or interrupted actions remain in `unconfirmed`, which the trainer ignores. If remote writes succeed but local confirmation fails, the book shows a recovery notice; exported unconfirmed snapshots need reconciliation with the actual action before any later training/import. Retrying the same inbox decision uses the same ID. Approvals are confirmed before inbox cleanup so a cleanup failure does not erase a decision that already went live.

This change implements capture (a) only. It does not train or publish a model. Part (b) must resolve how private decisions reach training without exposing the password or features; the top handoff proposes browser training. Preserve the existing 50-row/15-per-class thresholds, grouped holdout, advisory-only use and baseline comparison. Part (c) should sort within sections only after an active model is available.

## Going live (who does what)

1. **Codex** changes `book.template.html` on a `codex/<topic>` branch and opens a PR to `main`, tested with the dev build.
2. **Farouk** reviews and merges.
3. **A Claude chat session** rebuilds the real book from the merged template with the private catalogue and the book password, encrypts it with StatiCrypt, checks it, and publishes `book/index.html` to `gh-pages` with Farouk's go-ahead. Codex can't do this step: the catalogue with buy prices and the password are private and never go in the repo.

Never commit a built or decrypted book, the private catalogue files, `config.json` with real values, or any password or token.
