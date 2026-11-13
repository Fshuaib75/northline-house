# Product-page build and release

Run `node tools/product-pages.mjs SOURCE EMPTY_OUTPUT` using a fresh checkout of the public gh-pages catalogue as SOURCE. The generator reads only shop HTML, products, prices, stock and photo rules. It never reads owner secrets or order records.

The output contains static `/shop/products/REF/` pages, a product sitemap and a counts-only build report. HTML contains metadata and Product JSON-LD without waiting for JavaScript. Offers are included only for recently checked supplier stock; unknown/stale stock has no offer claim. Customers follow the live shop link to confirm current sizes and prices before ordering.

Release requirements:

- Build from current live public data immediately before deployment, including scheduled prices and live photo exclusions. Rebuild on changes to prices, products, supplier stock or photo rules, and at scheduled-price activation.
- Replace the generated product directory and sitemap as one release. Do not append to an older output: the builder requires an empty output to prevent hidden/removed pages surviving.
- Publish only with the owner's deployment approval. No workflow in this change pushes gh-pages.
- Previously indexed removed URLs should return 404/410 after removal. The sitemap contains only current priced and visible products.
- Keep price/stock snapshots refreshed. This static build is not a substitute for the shop's current-price check.
- Validate sample deployed pages with Google's Rich Results Test and Search Console URL Inspection. Submit the sitemap after deployment. No search ranking or rich-result appearance is guaranteed.

The workflow provides an artifact for review, not an automatic deployment. Wiring this artifact into the owner's live release/data-refresh process remains a deployment prerequisite.
