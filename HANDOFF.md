# Handoff log

Newest entry first. Rules and format are in `AGENTS.md`.

## 2026-10-24: Codex, codex/sculpted-clay-hero — approved draft upload, product-photo review outstanding

Did: rebased onto main after #21/#22, preserving Claude's review and the merged handoff. Prepared the hero source and three WebP campaign images for the separately approved draft PR. Four motion tests pass; previous everyday-panel desktop and 390px checks remain the completed visual QA.
Next: upload as draft only. Before publishing, replace AI-restyled product imagery with actual supplier product pixels composited onto generated settings, as required by Claude's review. Then preview every slide at 390 and 1280px and check product fidelity and mobile crops. This draft is not ready for go-live.
Watch out: current images are AI-restyled, so exact product pixel preservation is not established. This upload does not resolve that review requirement or authorize merge/deployment. Agent-sharing is a separate PR. Trendyol remains assisted open-tab capture only; catalogue and sealed files are unchanged.

## 2026-10-24: Claude, review of Codex's 24 Oct handoff (PR #22)

Did: merged `main` into this branch and kept both sets of entries. Checked Codex's note that pushes made with `GITHUB_TOKEN` don't trigger a Pages deploy: in this repo they do. The weekly-check robot commits 570dec1 (12 Oct), c3b1d13 and 2580679 (19 Oct) each have a Pages deployment, so the merged safety net (#21, `.github/workflows/inbox-forward.yml`) reaches the book.
Next: Codex, the forwarding workflow is merged (#21), so drop the workflow part of local `codex/inbox-safety-net`, rebase on `main`, and keep only the extension's persistent wrong-branch warning. Upload `codex/agent-sharing-accuracy` and `codex/sculpted-clay-hero` as separate draft PRs when Farouk approves. For the hero: product pixels must come from the real supplier photos (cut out and composited), with only the setting generated, so no buckle, colour or shape on the hero differs from what customers receive.
Watch out: the live hero (#19) went live on 23 Oct. The sculpted-clay hero would replace it, so it needs the same preview at 390 and 1280 px before any go-live.

## 2026-10-24: Codex, codex/handoff-status-oct24 — approved documentation upload

Did: prepared a documentation-only branch from main on Farouk's explicit approval to upload HANDOFF.md and open a draft PR. Includes the hero implementation and verification notes below; the hero source and images remain on the separate local codex/sculpted-clay-hero branch.
Next: review this draft documentation PR against main. Hero source upload and publishing are separate steps; no merge or deployment performed.
Watch out: this PR changes HANDOFF.md only. References to local implementation commits below describe work saved locally, not code included in this PR. Trendyol remains assisted open-tab capture only.

## 2026-10-24: Codex, codex/sculpted-clay-hero — handoff verification

Did: checked the saved implementation at e3fcdef against this log, fetched origin/main (still b4c8b34; no incoming main commits), and reran all four storefront motion tests successfully. Confirmed all three WebP references, one collection CTA per slide, explicit light CTA text, and the 170px mobile ordering anchor offset. The three assets total 306,098 bytes. This session changes documentation only.
Next: review the local hero branch, then upload/open a PR against main when authorized; no PR, upload, merge or deployment has been performed for this branch. Previous browser QA verified the everyday hero at desktop width and in a 390px iframe. Still check the bag and footwear crops on phones, physical-device swiping, and compare generated product details with supplier originals before publishing.
Watch out: this branch was created from main, so the detailed handoff entries on the other unmerged local branches are not included here. Separate saved work: codex/inbox-safety-net at 13bd325 (delta forwarding and persistent wrong-branch warning; GITHUB_TOKEN append does not trigger Pages publishing) and codex/agent-sharing-accuracy at 4b1885b (exact sizes and approved tagline). Preserve those branches and their own handoffs; they are not part of this hero commit. Aldo direct-link fallback and closing superseded PR #7 remain follow-ups. Trendyol remains assisted open-tab capture only. Catalogue and sealed files remain untouched.

## 2026-10-24: Codex, codex/sculpted-clay-hero

Did: fetched main and created this separate branch from b4c8b34. Applied the owner-selected sculpted-clay direction to all three shop hero panels, using generated campaign scenes based on existing product references. Added three optimized hero-clay-*.webp assets (about 300 KB total), short headlines and one shopping link per slide. Desktop uses full-width imagery; mobile uses a compact copy row and right-aligned image crop. Fixed CTA contrast and mobile ordering anchor offset. Existing carousel behavior and collection URLs retained. Four motion tests pass; desktop and 390px iframe visually checked.
Next: owner reviews the local branch before upload/PR and deployment. No upload, merge or deployment performed.
Watch out: images are AI-styled campaign scenes, not untouched supplier photographs; catalogue product photos remain unchanged. Originals remain a future direction. No data/sealed files touched. Agent-sharing and inbox-safety-net work stays on its separate branches. Generation used the built-in image tool: warm ivory plaster alcove, curved stone plinth, small terracotta vessel, directional window light and realistic contact shadows, empty left side, no text; each prompt requested preservation of its existing sandal, model/tote or square-toe slide detail reference.

## 2026-10-24: Claude, claude/inbox-forward (inbox safety net)

Did: Farouk handed the safety-net task back to Claude, so Claude built it. `.github/workflows/inbox-forward.yml` runs on every push to `main` that changes `inbox.json`. `tools/inbox/forward.mjs` copies only batches that are new in that push (in `after`, not in `before`) to `gh-pages` `inbox.json`, skips ids already live, and records every forwarded id in `gh-pages` `inbox-forwarded.json` so a re-run can never resurrect a reviewed batch. Nothing is decrypted, and the run is a no-op on an all-zero `before`. Pushes retry 5 times from a fresh `gh-pages` on a race. Tests: `tools/tests/test_inbox_forward.mjs`, 8 cases. All 44 Node tests pass. A replay against this week's real history forwards Thursday's 45-item send and nothing else, and a full simulation of the workflow steps against a synthetic origin forwarded once, then did nothing on a re-run after review.
Next: Codex, the extension popup warning when its saved branch is not `gh-pages` is still yours (extension lane). Farouk, after merging, nothing else is needed: the workflow arms itself on the next send that lands on `main`.
Watch out: `inbox-forwarded.json` exists only on `gh-pages`. Add it to the list of live files restored when deploying `main` to `gh-pages`. It's a plain list of batch ids, not sealed. The two batches already on `main` are not forwarded, because they predate this workflow and both were delivered by hand.

## 2026-10-24: Claude, inbox safety net (task for Codex)

Did: on 23 Oct at 17:59 a 45-item batch was again sealed into `inbox.json` on `main` (commit f9ded38), so it never reached the book. On Farouk's go-ahead, copied that one sealed batch, unopened, into the live `gh-pages` inbox (commit 1fa237c, deployed). Likely cause: an installed extension copy or a review download from before #16. #16's settings migration only runs in the updated extension code.
Next: Codex, add a workflow that forwards inbox batches that land on `main` to `gh-pages`. Trigger on `push` to `main` with a path filter on `inbox.json`. Append only batches that are new on `main` since the previous commit (compare `before`/`after` batch ids in the push), and skip any id already on `gh-pages`. Never forward older batches, because the book deletes reviewed batches from `gh-pages` and re-adding them would resurrect reviewed items. Don't decrypt anything, keep the 409/422-style retry on conflicts, and use `contents: write` only. Add a test with synthetic batches covering new, already-present and previously-reviewed ids. Separately, make the extension popup show a clear warning when its saved branch is not `gh-pages`.
Watch out: this is a safety net, not a replacement for sending to `gh-pages`. The batches already on `main` (ids 2026-10-22T10:28:33.550Z and 2026-10-23T14:59:14.381Z) have both been delivered, so the forwarder must not resend them.

## 2026-10-23: Claude, go-live of #19 and this week's tools

Did: on Farouk's "go live", merged #19 (reviewed at 703e049; 36/36 tests; rendered at 390 and 1280 px with live data) and merged `main` into `gh-pages` (e4299a2, deployed). Kept every data and sealed file at its live `gh-pages` version during the merge, so `main`'s stale `inbox.json` copy did not overwrite the reviewed live inbox. Earlier today: reviewed and merged #18 on Farouk's instruction.
Next: Codex, (1) on phones the hero "How to order" link lands with the heading under the sticky bars: raise `#how-it-works` `scroll-margin-top` to about 170px under `max-width:760px`; (2) pass the previous `brands.json` `url` into `shopify_check` as the direct link when a style has no `page` (all 12 Aldo styles); (3) close PR #7 (superseded).
Watch out: when deploying `main` to `gh-pages` in future, restore the live versions of the data and sealed files after merging (`inbox*.json`, `private.json`, `products.json`, `prices.json`, `brands.json`, `capone.json`, `drop.json`, `orders.json`, `reviews.json`, `build.json`, `tools/ig/posted.json`), because `main` holds stale copies.

## 2026-10-23: Codex, codex/animated-storefront — lighter hero copy (#19)

Did: reduced the text on all three hero slides at Farouk's request. Shortened the opening description, removed the bag/footwear paragraphs and removed image slogans and duplicate image links. Headlines and the primary collection buttons remain. Updated draft PR https://github.com/Fshuaib75/northline-house/pull/19.
Next: owner reviews the quieter hero layout. Owner decides merge/deployment.
Watch out: PR stays draft and unmerged. Trendyol remains assisted open-tab capture only; no catalogue, sealed files or deployment changes.

## 2026-10-23: Codex, codex/animated-storefront — Claude review fixes (#19)

Did: fixed the bag slide's inset rectangle with a full-panel cover crop. Replaced the branded footwear image with the same catalogue product's supplier detail angle (716-922-FDG-01-00001_K342_6.jpg), keeping the toe visible and removing the backdrop seam and readable insole wordmark. Removed the oversized mobile crop, used the Line accent colour and revised the repeated footwear headline. Rebased onto main at 58a1bbd, preserving the weekly-stock handoff entries. Updated draft PR https://github.com/Fshuaib75/northline-house/pull/19 with source, image and this log under the owner's existing upload authorization.
Next: owner/Claude reviews the corrected bag and footwear slides in draft #19. Four motion tests pass; desktop and 390px browser checks confirm full-panel images, visible toe and no readable insole branding. Physical-device swipe testing remains useful. Owner decides merge and deployment.
Watch out: #19 remains draft and unmerged; nothing was deployed to gh-pages. PR #18 is now merged into main. Trendyol remains assisted open-tab capture only. No catalogue, pricing or sealed files changed.

## 2026-10-23: Codex, authorized upload — draft PR #18 and #19

Did: on Farouk's explicit authorization, uploaded codex/expanded-weekly-stock (source, tests and this log) to Fshuaib75/northline-house and opened draft PR https://github.com/Fshuaib75/northline-house/pull/18 against main. Separately uploaded codex/animated-storefront and opened draft PR https://github.com/Fshuaib75/northline-house/pull/19 against main. Prior upload-approval blockers are resolved by that authorization. Validation and remaining checks are documented in each PR and the implementation entries below.
Next: owner reviews the two draft PRs independently. Do not merge either PR without a new instruction. When eventually merging, preserve both branches' HANDOFF entries if this shared file conflicts.
Watch out: Trendyol remains assisted open-tab capture only; no unattended marketplace scanning/API integration was added. Neither PR was merged, no gh-pages deployment was performed, and no production catalogue, stock or sealed files were changed. Current focus remains selling and marketing existing products; Originals is a future direction.

## 2026-10-23: Codex, codex/expanded-weekly-stock — delivery status

Did: refreshed this handoff at Farouk's request. Current priority is the website, sales and marketing of existing products; Northline Originals (abayas, jalabs and linens) remains a future direction. The completed weekly-stock and assisted Trendyol work is committed locally on codex/expanded-weekly-stock (implementation commit a6976a1). Validation remains 58 passing tests and live sample checks for Derimod, Marjin, Basic&Co. and Les Benjamins; details follow below.
Next: obtain explicit approval to upload this branch's source changes, tests and HANDOFF.md to Fshuaib75/northline-house, then open a draft PR against main. No PR exists for this work yet. After review and merge, run the existing Other brands weekly check workflow from main and reload the extension. Automated marketplace-wide Trendyol sourcing and weekly checks still need a verified data route and exact seller/listing scope.
Watch out: automatic approval review rejected creating the GitHub tree because uploading the changed source and full HANDOFF history requires explicit authorization for that payload and repository. Upload was stopped; no alternate upload method was attempted. This request updates the handoff only and does not authorize that previously blocked upload. The weekly expansion is not active yet. Trendyol changes support assisted open-tab capture only. The animated-storefront work is separately committed on codex/animated-storefront and also awaits upload approval; preserve that branch. Main/gh-pages, catalogue data and sealed files were not changed in this session.

## 2026-10-23: Codex, codex/expanded-weekly-stock

Did: expanded tools/brands/check.py to use the shared sourcing supplier/vendor allowlist, covering Derimod, Marjin, Basic&Co., Les Benjamins, Ippocampo and the listed Libas vendor brands alongside existing checks. Exact supplier product URLs avoid scanning full catalogues for newly sourced items. Product JSON identifies the item/options; its public Ajax product file supplies availability joined by variant ID. Stock stays colour-specific using sourcing colour digests or variant-linked images. Clothing sizes and one-size bags are supported; named sizes preserve the catalogue's labels. Ambiguous/missing stock keeps the previous record stale rather than declaring sold out. Existing Monday 05:17 UTC workflow uses this code from main; no new schedule or deployment required after merge.
Next: review/merge this branch into main, then run Other brands weekly check from main or await Monday (08:17 Istanbul / 06:17 Nigeria). Reload the extension for the assisted Trendyol flow. Any future automated Trendyol sourcing/stock service needs exact listings/sellers and a verified data route; the seller API is for sellers' own stores, not a general other-seller inventory feed.
Watch out: 26 Python stock tests and 32 Node sourcing/inbox/marketplace tests pass (58 total). Live sample reads verified Derimod, Marjin, Basic&Co. and Les Benjamins without writing catalogue or stock files. Libas vendors and Ippocampo have offline adapter coverage; full live catalogue dry-run remains. Trendyol support is assisted open-tab extraction only: preserves the listing URL/seller when available, warns about final TRY price/selected seller, and blanks ambiguous offers. No unattended Trendyol scraping/API integration was enabled or live Trendyol browser test claimed. Extension no longer invents unread size ranges or repopulates them when category/audience changes. Existing sealed files, catalogue/pricing data and gh-pages were untouched; the earlier animated-storefront work remains on its separate local branch.

## 2026-10-22: Codex, codex/animated-storefront

Did: replaced the static shop opening with three rotating collection panels (everyday essentials, bags, women's footwear) in shop/index.html, storefront.css and storefront.js. Added 6.5-second rotation, crossfade/slide transitions, arrows, dots, touch swipes, pause/play, keyboard controls, screen-reader announcements for manual changes, inactive-slide inert handling and below-fold editorial reveals. Rotation pauses on hover, focus, hidden tabs and offscreen; reduced-motion preference disables autoplay and transitions. First panel remains visible without JavaScript. Added two local images taken from existing catalogue URLs (USPA-BAG-VR011-SH and CAP-922-BRN); no new products or availability claims. Referral attribution is retained across new links.
Next: Farouk reviews the animated-storefront PR against main and decides merge/deployment. Browser checked desktop and a 390px iframe, slide controls and women's collection navigation with referral retained; four offline motion tests pass, plus syntax and diff checks. Touch/reduced-motion/background behavior has automated coverage; physical-device swiping remains a useful final check.
Watch out: no sealed files, catalogue/pricing data, agent tools or live branch changed. Existing approved wordmark and tagline are retained. Sites guidance informed accessible responsive motion; hosting stays in this GitHub repository. Preview files and screenshots are untracked QA artifacts, not part of the PR. Installing/merging this PR does not deploy gh-pages.

## 2026-10-22: Codex, owner-approved merge of PR #16 and #17

Did: Farouk authorized merging both upgrades into main. Merged inbox fix https://github.com/Fshuaib75/northline-house/pull/16 first; this handoff accompanies sourcing expansion https://github.com/Fshuaib75/northline-house/pull/17 into main. Code matches the previously verified 32-test result; this final commit changes only this log.
Next: run Sourcing scan on main for a fresh expanded review, update/reload the extension, and confirm an approved item appears in To review. New-brand weekly stock adapters remain follow-up work.
Watch out: merge authorization covers main only. No deployment to gh-pages, product publication or real inbox writes were performed. Old downloaded reviews and installed extension copies require regeneration/update.

## 2026-10-22: Codex, codex/sourcing-scale

Did: expanded automated discovery from 3 to 7 supplier sites with a shared allowlist (tools/sourcing/sources.json): Marjin, Les Benjamins, Basic&Co. and Libas added. Verified public products feeds and TRY via cart.js on all seven. Libas preserves explicitly allowed vendor brands instead of labelling everything Libas. Increased default scan to 8 pages/source and shortlist to 200; workflow exposes a bounded 1-500 review limit. Added exact supplier gender-tag support, conservative English clothing classification, child/outerwear exclusions, category/audience filters, brand/category/audience balancing, runtime currency checks and repeated-page detection. 29 Node tests plus 3 Python tests pass.
Next: review the sourcing-scale PR against main, built on inbox fix PR #16; merge #16 first so its changes drop out of this PR, then review/merge. Run Sourcing scan to generate fresh candidates. Owner reviews products, saves learning feedback and explicitly sends approvals through the inbox. Add stock-check adapters for newly approved brands before relying on automated weekly coverage.
Watch out: live bounded scan examined 12,035 supplier records, found 1,078 eligible colour-level candidates after working-catalogue deduplication/price checks, shortlisted 200 across Capone, Les Benjamins, Aldo, Marjin, Derimod, Basic&Co., Ippocampo and Rene Derhy (97 shoes, 79 clothing, 24 bags). Most Libas items exceeded the unchanged N100,000 estimated-sale ceiling; only one qualified. Supplier scans are partial except Basic&Co.; no absence/stock removals inferred. Generated review delivered separately with gh-pages default from #16. No sealed files, catalogue data or live branch changed. ML still needs real labelled feedback; no new predictive claims. The workflow uses live catalogue/pricing; this local scan used the working checkout's catalogue/pricing.

## 2026-10-22: Codex, codex/inbox-branch-fix

Did: pulled main at 871e2ad and corrected the sourcing review dialog and extension defaults to gh-pages. Added a shared config migration in tools/extension/seal.js: existing Northline main settings move to gh-pages once, retaining the token; custom repos/branches and subsequent explicit overrides stay intact. Both extension settings and popup persist the migration. Settings, popup and review explain the destination. All 25 sourcing/inbox tests pass, including mocked gh-pages reads/writes, migration, custom settings and existing conflict retries.
Next: Farouk reviews this branch's PR. After merge, regenerate the sourcing review download and reload/update the extension. Send one approved item and confirm it appears in the book's To review tab.
Watch out: no real inbox/key files were opened or written, and nothing was deployed. Delivery uses one selected branch, not a main mirror: copying pending batches alone cannot synchronize the book's later removals and could reintroduce reviewed items. Old review downloads still default to main; manually change their Branch field to gh-pages or regenerate. Existing sealed batches are untouched. Network verification used synthetic keys and mocked GitHub responses.

## 2026-10-22: Claude, inbox went to the wrong branch

Did: Farouk's first send from the review page worked, but it sealed 4 items into `inbox.json` on `main` (commit 055aad3). The book loads the inbox from the live site (`fetch("../inbox.json")` in `northline-site/build-files/book-template.txt` in the claude.ai Project), so it reads `gh-pages`, which was empty. On Farouk's go-ahead, copied that one sealed batch, unopened, into `gh-pages` `inbox.json` (commit 459a2c7, deployed).
Next: Codex, make `gh-pages` the default branch for the review page dialog (`tools/sourcing/review.html`) and the Chrome extension (`tools/extension/options.js` and `popup.js`, `DEF.branch`). Better still, append each batch to both `gh-pages` and `main`, the way the robot delivery steps do, so the two copies never drift. Add a test that the default is `gh-pages`.
Watch out: any extension sends made with the default `main` branch never reached the book either. `main` now holds a copy of the same batch; leave it, since the book never reads `main`.

## 2026-10-22: Codex, codex/inbox-button (PR #14)

Did: opened https://github.com/Fshuaib75/northline-house/pull/14; added Send to review inbox beside Export approved in `tools/sourcing/review.html`. `engine.mjs` embeds the existing `tools/extension/seal.js` into each standalone review, retaining its encryption, append and 409/422 retries. First use asks for repository, branch (extension defaults: Fshuaib75/northline-house/main) and a fine-grained token held only in page memory. Added forget-token control, pending-send guard, same-page repeat-send prevention and a destination/result message. Nine new tests cover encryption/decryption, concurrent append preservation, retry exhaustion, auth failures, approved-only submission, failure recovery and standalone build; all 22 sourcing/inbox tests pass. Browser checked button enablement, first-use dialog and cancel.
Next: Farouk reviews the PR. After merging, run Sourcing scan to obtain a newly generated review.html (old downloads do not gain the button). Open it in local Chrome, approve one item, send and confirm it appears in the book's To review tab. Match repository/branch to extension settings if customized.
Watch out: the cloud browser blocks file:// navigation by URL policy, so actual file-origin GitHub CORS and authenticated delivery could not be verified here; no real token or inbox files were read or written. Network behavior is tested with synthetic keys and mocked responses. The book's branch remains unverified. Same-page resend prevention resets on reload; after an ambiguous network failure check To review before retrying. No persistent token storage, automatic publishing or deployment changes.

## 2026-10-22: Claude, claude/inbox-button-handoff

Did: logged Farouk's request below, and clarified rule 4 in `AGENTS.md`: adding a sealed batch to `inbox.json` with the existing seal tools is allowed when the owner asks. Reading, editing or removing sealed files is still not.
Next: Codex, add a **Send to review inbox** button to `tools/sourcing/review.html`, next to "Export approved". It should seal the approved items with the same lock and code as the Chrome extension (`tools/extension/seal.js`, public key from `inbox-pub.json`) and append the batch to `inbox.json` through the GitHub API, using the same repo and branch settings as the extension (`options.js`, default branch `main`), so they appear in the book's To review tab with no command line. Use the extension's token approach (fine-grained token, `northline-house` only, Contents read and write); ask for it on first use and don't store it beyond the browser session unless Farouk opts in. Handle the 409/422 conflict retry the way `seal.js` does. Keep "Export approved" as the fallback. Add a test, and a line in the review page saying where the items went.
Watch out: `book/index.html` is password-encrypted (staticrypt), so neither agent can read which branch the book loads `inbox.json` from; matching the extension is the safe choice, and Farouk should confirm one test item shows up in To review. The review page is opened as a downloaded local file, so check the GitHub API calls work from a `file://` page in Chrome. Nothing should publish: items only land in the inbox, and the book stays the approval step. Until this ships, Farouk can send Claude his exported file to seal by hand.

## 2026-10-22: Claude, claude/sourcing-scan

Did: added `.github/workflows/sourcing-scan.yml`, a manual "Sourcing scan" action. It runs `tools/sourcing/collect.py` and `engine.mjs build` on GitHub's servers against the live `products.json`, `prices.json` and `shop/index.html` from `gh-pages`, then uploads `review.html` and `candidates.json` as the `sourcing-review` artifact (kept 14 days). Read-only: no commits, no shop changes.
Next: Farouk runs it from Actions when he wants new candidates. Codex, if `engine.mjs` arguments or file locations change, update this workflow too.
Watch out: Claude's workspace can't reach the brand sites, which is why this runs on GitHub. It has `contents: read` only.

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
