# Instagram weekly preview and daily post

The May look stays: cream/earth palette, supplied Northline wordmark, Newsreader and Jost, product-only photographs. A preview renders seven dated feed (1080×1350), story (1080×1920) and caption sets using the **same `pick()`** as the real robot.

## Preview first

Actions → **Instagram daily post** → Run workflow → **Preview next 7 days**. Main-branch preview runs commit only generated `ig-preview/` assets to gh-pages and request a Pages build. After that build completes, open **https://northlinehouse.shop/ig-preview/** on a phone. Check the snapshot timestamp to confirm it refreshed. Other branches produce downloadable artifacts only.

The page is noindex, not password-protected; it contains public product/retail information only. Each day has feed/story downloads, copyable caption, its `?i=<ref>&a=IG` story link and its `?i=<ref>&a=FB` Facebook link. Copy falls back to selected text if clipboard access fails. No API adds a link sticker: download the story and add the link while manually uploading it. Set repository variable `IG_AUTO_STORY=false` if you want manual sticker stories instead of duplicate automated stories.

Preview runs never receive the Meta secrets, call Meta, or update `tools/ig/posted.json`. A copy of that state advances only after each simulated day's images render successfully. Selection alternates audiences using the real picker, respects 60-day recency, then drop/recent/value priority. Forecast dates start at the next 18:30 Lagos slot. Stock, prices, successful posts and drop edits can change the actual week; regenerate after changes. Photo failures and insufficient candidates appear as explicit not-ready slots, never substitute products or fake repeats. Failed photo downloads are cached within that preview run; regenerate to retry.

## Pinned posts

The preview also generates three manual-upload pinned-post sets, with captions:

1. How to order: choose on the site, WhatsApp, size confirmation, bank transfer, delivery within 14 days of payment.
2. Delivery & payment: shipping to Nigeria included; Abuja-to-address courier paid on delivery; bank transfer after confirmation; no size exchanges.
3. This week's drop: real eligible current drop styles/prices, six per 1080×1350 image. A larger drop is one carousel post, with more images instead of unreadable tiny products.

There is no origin-city/country wording on those pinned assets. The robot does **not** upload or pin them automatically. With no current eligible drop, or a failed drop photo, the drop set is marked not ready. Publish a current drop from the book rather than inventing a selection. Dated drops expire after seven days, including the above-₦70,000 exception.

## Pick rules shared by live posts and previews

- Canonical `tools/sourcing/minimal.mjs` is called through the Node batch bridge; there is no drifting Python copy.
- Above ₦70,000 is excluded unless in the active drop. Hidden/sold-out styles remain excluded; recorded current stock sizes are used. Size captions list actual sparse sizes and never invent ranges/default sizes.
- Photo guard blocked filenames/person scores are respected, including its reviewed `allowed` overrides. Optional `photo-checked.json` `labels` or `types` maps may be keyed by URL or filename, with a string or `{type/label}` record. Known non-product labels (charts, infographics, people etc.) are rejected; known product labels are preferred over URL heuristics. Current numeric-only guard records fall back to rejecting `olcu`, `ölçü`, `beden`, `size`, `chart` in decoded URLs. The actual download loop repeats these checks, including fallback images. Unknown opaque URLs still need the owner's preview check; a filename rule cannot inspect image contents.
- Captions clarify included shipping, Abuja delivery and size-exchange terms. Facebook's photo caption links to the exact product with `a=FB`, not the homepage.

## Going live only after Claude's phone check

This PR does not enable posting, alter account settings or send social posts. After merge:

1. Run the preview on main. Claude checks it on a phone, including photos, image crops/text, prices, captions, product links and copying.
2. Farouk approves, then sets **IG_POSTING_ENABLED=true** in repository Actions variables. Without it, even scheduled or “Post today” runs stay previews. This gate also applies inside `--publish`.
3. Existing `IG_USER_ID` and `IG_TOKEN` secrets enable Instagram; optional `FB_PAGE_ID` enables Facebook. Keep tokens only in Secrets; do not paste them in the page, repo or chat. Platform tokens/permissions must be checked in Meta; no claim that a token can never expire.
4. Cron remains 17:30 UTC / 18:30 Lagos. “Post today” is a deliberate manual live run only when the gate and secrets are present. The rendered caption is rechecked against current catalogue data before sending. Actual posting history is committed only after publish returns, and never pushed to main by this workflow.

A Meta failure after a feed was published but before the story/history step finishes can still leave a partial post. Inspect the account before rerunning a failed live run; per-platform publish checkpoints are a useful follow-up. Preview mode has no such posting risk.

## Local verification

`python3 -m unittest discover -s tools/tests -p test_ig_preview.py -v` uses synthetic data and mocked downloads/Meta; it does not post. Pillow and Node are required. `python tools/ig/autopost.py --preview-week` renders using local public catalogue/state into `ig-preview/`; use `NL_SITE_ROOT=/absolute/test-or-live-checkout` to read a separate public site snapshot. Do not run `--publish` during review. Tests check real picker order, no state mutation, photo/colour/price rules, actual sparse sizes, rendering dimensions, captions/noindex/copy links, expired drops, explicit failures, Facebook URLs and approval gating.

Pages build request documentation: https://docs.github.com/en/rest/pages/pages#request-a-github-pages-build . The workflow verifies the configured source is gh-pages before requesting a build; it never copies main's shop/hero onto the live site.
