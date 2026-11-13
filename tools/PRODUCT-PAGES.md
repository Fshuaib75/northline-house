# Product-page build and release

Run `node tools/product-pages.mjs SOURCE EMPTY_OUTPUT` using a fresh checkout of the public gh-pages catalogue as SOURCE. The generator reads only shop HTML, products, prices, stock and photo rules. It never reads owner secrets or order records.

The output contains static `/shop/products/REF/` pages, a product sitemap and a counts-only build report. HTML contains metadata and Product JSON-LD without waiting for JavaScript. Offers are included only for recently checked supplier stock; unknown/stale stock has no offer claim. Customers follow the live shop link to confirm current sizes and prices before ordering.

Release requirements:

- Build from current live public data immediately before deployment, including scheduled prices and live photo exclusions. Rebuild on changes to prices, products, supplier stock or photo rules, and at scheduled-price activation.
- Replace the generated product directory and sitemap as one release. Do not append to an older output: the builder requires an empty output to prevent hidden/removed pages surviving.
- Publish only with the owner's deployment approval. The refresh workflow is disabled unless the repository variable `PRODUCT_PAGES_ENABLED` is exactly `true`. Leave it unset until approval.
- Previously indexed removed URLs should return 404/410 after removal. The sitemap contains only current priced and visible products.
- Keep price/stock snapshots refreshed. This static build is not a substitute for the shop's current-price check.
- Validate sample deployed pages with Google's Rich Results Test and Search Console URL Inspection. Submit the sitemap after deployment. No search ranking or rich-result appearance is guaranteed.

`product-pages-preview.yml` provides a read-only artifact. `product-pages-refresh.yml`, once approved and enabled, builds from the latest gh-pages data on public catalogue changes, successful stock/photo jobs, and hourly (including scheduled prices and stock ageing). Scheduled price publication can lag by up to one hour plus Actions queue time. It can also be run manually from main.

The refresh uses main's generator, updates only manifest-owned product pages and the sitemap, and rejects collisions with existing unowned pages. Removed or hidden pages are deleted from the owned set. It rebuilds against fresh data after rejected pushes, at most three attempts. The configured Pages source must be gh-pages root; after publication it explicitly requests a Pages build, including on retry after a failed build request. Disable the variable to stop future refreshes. This does not remove already published pages.

The generator accepts both the historical embedded catalogue and `shop/catalogue.json`. Deploy the split catalogue file together with its shop HTML and updated readers; preserve the current live catalogue and photo-rule block when applying code changes. No refresh has been enabled or run as part of this PR.
