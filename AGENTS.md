# Northline House: rules for AI agents

Two AI agents work in this repo: **Codex** and **Claude**. Both read this file before starting. The owner, Farouk, decides what gets merged.

## What this repo is

The live site at northlinehouse.shop (GitHub Pages, see `CNAME`). It's a curated shop of Turkish brands, sold to Nigeria with orders on WhatsApp.

- `index.html`: agent page
- `shop/`: public shop
- `book/`: the owner's private book (review, prices, publish)
- `orders/`, `me/`, `photo-check/`: other pages
- `*.json` in the root: product, price, brand and order data
- `brand/`: logos, brand sheet, packaging
- `tools/`: build patches, weekly checks, Instagram autopost
- `.github/workflows/`: scheduled jobs (weekly price checks, daily Instagram post)

## Branches and deployment

- **`gh-pages` is the live site.** The weekly price checks and the Instagram autopost commit their data there (see `.github/workflows/`), so `gh-pages` is usually a few robot commits ahead of `main`.
- **`main` is the working branch** for code, brand files and docs. The robots also try to push to `main`, but that can fail without anyone noticing.
- **Merging to `main` doesn't put anything live.** Getting a change onto `gh-pages` is the owner's call. Don't push or merge to `gh-pages` without the owner's go-ahead.
- Open pull requests against `main` unless the owner says otherwise.
- **Publishing `main` to `gh-pages`:** keep the live data files and the live photo rules: the photo guard updates `photo-rules.json`, `photo-checked.json`, `photo-health.json` and the `NL-PHOTO-RULES` block in `shop/index.html` and `index.html` on `gh-pages` only.

## Lanes

Each agent stays in its lane, so the two never edit the same file at the same time.

| Lane | Owner | Paths |
|---|---|---|
| Site code | **Codex** | `index.html`, `shop/`, `book/`, `orders/`, `me/`, `photo-check/`, `tools/*-patch.py`, `tools/extension/` |
| Brand and content | **Claude** | `brand/`, `tools/packaging/`, docs, captions, Instagram copy |
| Data | **Robots and the owner's book** | `products.json`, `prices.json`, `brands.json`, `capone.json`, `drop.json`, `orders.json`, `reviews.json`, `inbox-forwarded.json`, `photo-checked.json`, `photo-health.json` (gh-pages only); `photo-rules.json` (photo guard) |
| Shared | Both, one at a time | `AGENTS.md`, `CLAUDE.md`, `HANDOFF.md`, `.github/workflows/`, `tools/ig/` |

If a task needs a file in the other agent's lane, write it in `HANDOFF.md` and leave the file alone.

## Rules

1. **Never commit to `main` or `gh-pages`.** Work on a branch named `codex/<topic>` or `claude/<topic>` and open a pull request.
2. **Pull `main` before starting**, and rebase before opening a PR.
3. **Don't hand-edit data files** unless the owner asks. The weekly robots and the book write them.
4. **Never read, edit or remove sealed files**: `private.json`, `inbox.json`, `inbox-key.json`, `inbox-pub.json`. They're encrypted, and only the owner's book opens them. The one allowed write is adding a new sealed batch to `inbox.json` with `tools/seal-inbox.mjs` or `tools/extension/seal.js`, when the owner asks.
5. **Never put secrets in the repo.** Tokens live in GitHub Actions secrets.
6. **No invented facts.** No fake reviews, fake stock counts or made-up numbers on the site or in posts.
7. **Brand:** follow `brand/BRAND-SHEET.md` and use the logos in `brand/`. Don't redraw the wordmark.

## Handoff

After every session, add an entry at the top of `HANDOFF.md`:

```
## YYYY-MM-DD: <agent>, <branch>
Did: what changed (files, PR link)
Next: what's left, and who should do it
Watch out: anything the other agent must know
```

Before starting, read the latest entries in `HANDOFF.md`.
