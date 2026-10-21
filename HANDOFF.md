# Handoff log

Newest entry first. Rules and format are in `AGENTS.md`.

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
