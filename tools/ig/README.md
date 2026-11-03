# Instagram weekly preview and daily post

The owner selected **men's daily posts only**, including men's bags, wallets, belts and gift sets. `IG_AUDIENCE = "M"` in `autopost.py` is the single audience setting. Set it to `"W"` for women or `None` to restore alternating Men/Women picks. Fixed-audience mode never fills a shortfall with another audience.

## Selection and colour carousels

Preview and live publishing share `pick()`. Within the configured audience, prefer a different brand from the previous post and the ₦25–45k band. Then prefer current-drop styles and recent additions. Sold-out, hidden, photo-blocked and non-minimal styles remain excluded. Above ₦70k requires the active-drop exception. Dated drops expire after seven days.

Use `grp` when supplied. Otherwise derive identity from brand, `g`, and the supplier reference after removing a recognised colour token, retaining audience suffixes and model identifiers. `SIV-BOSTON-BLK-M` and `SIV-BOSTON-BRN-M` group together. Capone N/M/L colour codes, Slazenger numeric colour suffixes and DeFacto AX colour suffixes are handled. Unknown suffixes remain distinct to avoid merging unrelated products. Generic names such as Slide never determine grouping.

One daily post contains one style, with one feed slide per eligible colour. Captions list each colour, unchanged price and exact recorded sizes. Colours are listed once. History records `posted_styles` and each colour reference after successful publication. Any colour reference in legacy history suppresses the whole style for 60 days, including colours temporarily unavailable. Empty history stays empty until a real post succeeds. More than ten colours fails before publishing.

## Photographs and copy

Keep the supplied Northline wordmark, sand palette, Newsreader and Jost. Use product-only photographs under the existing photo policy. Known people, charts and non-product labels remain blocked on fallback downloads too. Unknown opaque photographs still require visual inspection.

Trim studio margins before fitting at a target 79% panel width, bounded by panel height. Flood fill starts only at corners classified as background. Small enclosed near-white studio gaps are removed on dark products. Declared pale/white products use a stricter exterior threshold. Exact grey-background gaps can be removed around white straps, while brighter straps and shaded pale footbeds remain foreground. Ambiguous enclosed white-on-white areas are preserved and require photo review.

Generic model names are expanded using the description and product type. Captions capitalise descriptions and remove “confirm size before payment” from product descriptions, keeping the single confirmation instruction in the terms. Hashtags follow product type. Bags and accessories receive no slide/palm hashtags.

Size captions use recorded sparse stock sizes per colour and never invent ranges. The original 3–9 November seven references had no records in the supplier stock maps, so sizes were unknown. Revised Sivarro picks include recorded sizes.

## Preview first

Actions → Instagram daily post → Run workflow → Preview next 7 days. Main-branch previews replace only generated `ig-preview/` assets on gh-pages and request a Pages build. Other branches produce downloadable artifacts. The public page is noindex, not password protected. Preview mode never receives Meta secrets, calls Meta or writes posting history. Forecasts begin at the next 18:30 Lagos slot and assume successful posting with unchanged stock/prices.

Each day offers all colour feed slides, one story, caption and exact product links. Stories need a manually added link sticker. `IG_AUTO_STORY=false` disables automated stories. Render failures and insufficient candidates produce explicit not-ready slots.

Three manual-upload pin sets cover ordering, delivery/payment and the current drop. Drop pages show four products each with at least 36px secondary text and separate photo/name/price spacing. Pins are not uploaded or pinned by the robot. With no current drop or missing photos, the set is marked not ready.

## Publication gate

Review actual rendered images and captions before setting `IG_POSTING_ENABLED=true`. Live mode requires that gate, main and credentials. `IG_USER_ID` and `IG_TOKEN` stay in Actions Secrets. `FB_PAGE_ID` is optional. A partial Meta failure can leave a post published before history is written, so inspect the account before retrying.

Keep development on a feature branch and open a PR against main. Deployment and publishing require the owner's approval. The workflow never pushes posting history to main.

## Verification

Run `python -m unittest discover -s tools/tests -p 'test_ig*.py' -v` with Pillow and Node installed. Tests cover real reference families, legacy history, men's accessories, white gaps/pale products/corners, captions, stock, preview state isolation, pins, product URLs and publication gating.

Run `python tools/ig/autopost.py --preview-week` against a public site snapshot using `NL_SITE_ROOT`. Do not run `--publish` during review. Generated review assets and supplier-photo caches are not catalogue edits.
