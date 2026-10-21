# Northline shopping bag

Print-ready artwork for the Northline paper bag. The wordmark is the outlined vector from `brand/northline-wordmark-cream.svg`, so it doesn't depend on any installed font.

| File | What it is |
|---|---|
| `bag-front.svg` | Front panel artwork, 340 × 300 mm, 1 unit = 1 mm |
| `bag-back.svg` | Back panel artwork, 340 × 300 mm |
| `bag-mockup.png` / `.svg` | Front and back side by side, for showing printers and posting |
| `bag-front-preview.png`, `bag-back-preview.png` | Flat previews of each panel |

To regenerate everything after changing the layout: `python3 tools/packaging/build_bag.py .` (needs `pip install cairosvg`).

## Spec to send printers

- **Size:** 34 W × 12 D × 30 H cm. Measure your largest pair before ordering, because this is sized for men's EU 45 slides.
- **Paper:** matte ink (`#2E2C29`, near-black), 160–175 gsm, with a cardboard insert in the base and the top fold.
- **Handles:** brown twisted cord (black if brown isn't available).
- **Print:** one colour only, cream `#EFE8DC`. Hot-foil stamping if the quote allows it.
- **Front:** NORTHLINE wordmark, "EST. 2026" with a line on each side, small caret mark at the bottom.
- **Back:** small wordmark, WhatsApp QR code, "Scan to order on WhatsApp", `@northline_house`.

## Before printing

1. **Replace the QR placeholder** with a real code that links to `https://wa.me/<business number>`.
2. **Convert text to outlines.** "EST. 2026", "QR", "Scan to order on WhatsApp" and `@northline_house` are live text set in Jost, which is in `tools/ig/fonts/`. Either give the printer that font or have them outline the text.
3. **Ask for a dieline and a physical sample** before approving the full run.

## Questions to ask every printer

1. Minimum order quantity, and price per bag at 100, 200 and 500.
2. Price with one-colour hot-foil on the front and back.
3. Can you do brown cord handles?
4. Dieline and sample before the run?
5. Lead time?
