# Handoff log

Newest entry first. Rules and format are in `AGENTS.md`.

## 2026-10-22: Claude, merged PR #10 and PR #11 into main

Did: on Farouk's instruction, merged #10 (stock-check safety) and #11 (sourcing discovery and review) into `main`. Ran both test suites first: 12/12 and 13/13 pass. Resolved this file's conflict by keeping both Codex entries. Review notes are on each PR.
Next: Codex, (1) add an expiry to stale stock records: hide a product (`on: 0`) after 2 unverified weekly runs in a row and list it in the report; (2) once Derimod products are approved into the catalogue, add Derimod to the weekly stock check in `tools/brands/check.py`; (3) close PR #7. Farouk, decide when `main` goes live on `gh-pages`.
Watch out: Farouk approved Derimod as a sourcing brand (22 Oct 2026). Nothing from #10 or #11 is live yet: the robots in `.github/workflows/` run from `main` code but write to `gh-pages`, so #10's safer checks take effect from the next scheduled run.

## 2026-10-22: Codex, codex/sourcing-learning (PR #11)

Did: opened https://github.com/Fshuaib75/northline-house/pull/11; added bounded Shopify catalogue discovery for Capone, Aldo and new source Derimod (`tools/sourcing/collect.py`), stock-evidenced normalization and price-aware ranking (`engine.mjs`), owner review/export UI (`review.html`), and approval-preference logistic regression with grouped holdout validation (`ranking.mjs`). A live four-page scan per source examined 3,000 products, found 324 eligible candidates and shortlisted 60 across three brands. Added 13 passing regression tests in `tools/tests/test_sourcing.mjs`; checked browser approve/reject and findings export. No catalogue or sealed files changed.
Next: Farouk reviews candidates, saves real approval/rejection feedback and routes approved findings through the existing owner inbox flow. Run `python tools/sourcing/collect.py --output /tmp/nl-sources --pages 4`, then `node tools/sourcing/engine.mjs build /tmp/nl-sources /tmp/nl-review`. Train with `node tools/sourcing/engine.mjs train /tmp/nl-model.json feedback.json`; pass that model as the optional final build argument. Owner decides merge/deployment; this is independent of reliability PR #10.
Watch out: scans are bounded/partial and never infer missing stock. Snapshots older than 48 hours are rejected at build. Weights and classification are estimates; recheck supplier stock, size, material and price before publishing. Review decisions live in memory until exported. No real feedback exists yet: ranking uses rules until at least 50 distinct valid decisions (15 each class), adequate grouped holdout classes and improvement on both Brier score and balanced accuracy. This predicts owner preference, not sales. No automatic publishing, training schedule or paid AI dependency.

## 2026-10-22: Codex, codex/bot-reliability (PR #10)

Did: hardened supplier stock checks in `tools/brands/check.py` and `tools/capone/check.py`. Failed reads and unmatched products retain previous records with a stale flag; verified records carry a check timestamp. Incomplete Shopify pagination is rejected instead of being treated as a complete catalogue. Brand-filtered runs retain other brands' records. Added offline regression coverage in `tools/tests/test_stock_safety.py`.
Next: review draft PR https://github.com/Fshuaib75/northline-house/pull/10 against main, then run a dry supplier check before deciding whether to deploy to gh-pages. Further engine work should cover product identity, price/margin changes and ranked sourcing recommendations into the owner's approval inbox.
Watch out: 12 offline tests pass; no live supplier scan or production data write was performed. Stale records preserve last known stock, not a fresh availability guarantee. Existing storefronts still use that last known stock; per-item freshness UI is a follow-up. A run with fewer than one-third freshly verified styles aborts without writing. Image-match misses now require manual verification rather than automatically delisting products. No workflows, sealed files or catalogue data were edited.

## 2026-10-22: Claude, go-live (PR #6, #8, #9)

Did: on Farouk's instruction, replaced "Modern form. Rooted soul." on the storefront with the approved tagline (kicker now "NORTHLINE HOUSE", footer line "Considered everyday essentials.", hero signature removed). Checked `shop/` at 390px and 1280px with the live data: no script errors, no sideways scroll. Merged #8, #6 and #9 into `main`, then merged `main` into `gh-pages` to put it live.
Next: Codex, PR #7 (shop card polish) is superseded by #9 and was left out. Close it, or port anything still useful onto a new branch from `main`.
Watch out: `main` and `gh-pages` now both carry the storefront. Robot data keeps landing on `gh-pages` first.

## 2026-10-22: Codex, codex/northline-storefront (PR #9)

Did: redesigned the customer storefront: editorial opening featuring `ZIYA-11049-BRN`, collection links, a three-step "how to order" section, and responsive styling (`shop/index.html`, `shop/storefront.css`, `shop/storefront.js`, `shop/assets/leather-slide.jpg`). Fixed `urlFor()` so women's collection links no longer switch to men on reload. The referral `a` parameter carries into the new links. Agent page, owner book, commissions, pricing and WhatsApp order logic were not changed.
Next: none from this PR.
Watch out: Codex's original detailed log for this work is in the git history of `HANDOFF.md` on this branch (commit `42f4d24`). `.preview/` and `.openai/` are local preview folders and must not be committed.

## 2026-10-22: Claude, decision from Farouk

Did: Farouk approved the tagline "Considered everyday essentials." Recorded in `brand/BRAND-SHEET.md` (PR #6).
Next: Codex, in PR #9 remove "Modern form. Rooted soul." from `shop/index.html` and use "Considered everyday essentials." as the only tagline.
Watch out: the other two decisions (PR #7's base branch and how `main` reaches `gh-pages`) are still open.

## 2026-10-22: Claude, chore/agent-handoff and brand/shopping-bag

Did: read Codex's notes here and in PR #9. Confirmed from the workflows that `gh-pages` is the live site and the robots commit there, and added a "Branches and deployment" section to `AGENTS.md`. On PR #6, removed the Istanbul framing from `brand/BRAND-SHEET.md` to match the owner's rejection of origin-led lines, and noted the PR #9 taglines as pending approval.
Next: Farouk decides (1) whether PR #7 stays on `gh-pages` or moves to `main`, (2) how `main` changes reach `gh-pages`, and (3) whether to approve "Modern form. Rooted soul." and "Considered everyday essentials."
Watch out: PR #9 adds its own `HANDOFF.md`, which will conflict with this one once PR #8 merges. Codex, after #8 merges, rebase #9 on `main`, keep this shared file, and move your storefront notes into a dated entry at the top. Merge order: #8 first, then #6 and #9 in either order.

## 2026-10-22: Codex, chore/agent-handoff

Did: checked the latest `main` revision (`cf0e0f4`), read `AGENTS.md` and this log from PR #8, and verified the status of the open shop UI PR #7. No site, data, or owner-only files were changed in this session.
Next: Farouk, review PR #8 so the shared rules become available on `main`. Codex can then continue site work on a `codex/<topic>` branch.
Watch out: PR #7 remains open against `gh-pages`, following the earlier site brief. The new `AGENTS.md` says to pull and rebase on `main`; decide whether that PR should be retargeted before merging. Its PR description reports phone and desktop checks, but console logs and PR-attached screenshots were not verified here.

## 2026-10-22: Claude, claude/agent-handoff

Did: added `AGENTS.md` (shared rules and lanes), `CLAUDE.md` (pointer to `AGENTS.md`) and this file.
Next: Codex, pull `main` once this is merged and read `AGENTS.md`.
Watch out: nothing in this PR touches site code or data.

## 2026-10-22: Claude, brand/shopping-bag (PR #6)

Did: added shopping bag artwork in `brand/packaging/` (front and back panels at 340 × 300 mm, mockup, printer spec), `brand/BRAND-SHEET.md`, and `tools/packaging/build_bag.py`.
Next: the owner sends the WhatsApp business number so the QR placeholder can be replaced, then gets printer quotes.
Watch out: the bag uses the existing outlined wordmark from `brand/northline-wordmark-cream.svg`. No site files were changed.

## 2026-10-22: Codex, codex/shop-card-polish

Did: polished shop product cards in `shop/index.html` and `tools/ui-flow-patch.py`. No data files were changed.
Next: Farouk to review PR #7.
Watch out: PR #7 is open against `gh-pages`; see the current entry above before changing its base.
