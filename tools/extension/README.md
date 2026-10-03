# Add to Northline (Chrome extension)

Save the product you're looking at into your review inbox in one click. Nothing goes live until you approve it in your book.

## What it does

1. You open a product page on any shop (Capone, Hotiç, Modanisa, Trendyol, LC Waikiki…) as a normal visitor.
2. Click the extension (or press **Alt+N**). It reads that page: name, brand, price in lira, photos, sizes in stock, colour.
3. It turns the Turkish details into your catalogue fields: category, type, English model name ("Faux leather buckle slide"), colour and colour group, reference code.
4. It previews the Nigeria price with your book's settings (from `prices.json`): landed cost, your profit, the agent's 25%, selling price. It flags thin margins (under ₦5,000) and prices over ₦65k.
5. Check the fields, untick bad photos, press **Add to list**. Repeat for more products.
6. Press **Send to review inbox**. The list is sealed with your inbox lock (only your book can open it) and added to `inbox.json`. Approve or reject in your book → To review.

It never logs in anywhere, never loads pages on its own and never tries to get past a site's blocks: it only reads the tab you opened.

## Install (desktop Chrome, Edge or Brave)

1. Download the `tools/extension` folder (or the zip Claude sent) and unzip it.
2. Open `chrome://extensions`, switch on **Developer mode** (top right).
3. Click **Load unpacked** and pick the `extension` folder.
4. Pin it (puzzle icon → pin "Add to Northline").
5. Open its **Settings** (⚙ in the popup) and add a GitHub token: the steps are on that page. Use a fine-grained token limited to `northline-house` with **Contents: Read and write**.

No token yet? Use **Download findings** instead and seal the file from the repo folder with `node tools/seal-inbox.mjs findings.json`.

## How it reads a page

In order, using the first that has the detail: product data built into the page (Schema.org JSON-LD), the public product file Shopify stores publish (`/products/<name>.js`), share tags (Open Graph), then a scan of the page for price, size buttons and large photos. Sizes marked sold out or disabled are left out. Everything is editable before you add it.

## Files

- `manifest.json` · extension settings (permissions: the active tab when you click, storage, GitHub)
- `extract.js` · the page reader (runs in the product tab only when you click)
- `guess.js` · Turkish → English fields, references, price preview
- `seal.js` · sealing (same as `tools/seal-inbox.mjs`) and saving to `inbox.json`
- `popup.*`, `options.*` · the screens
