# Mobile performance audit — 13 November 2026

Three separate browser contexts per version; Edge headless at 390 × 844, 4× CPU slowdown, 1.6 Mbps download, 150 ms latency. Local uncompressed server with real supplier image URLs. Samples cover loading through ten seconds after DOMContentLoaded. Remote response timing varies. These are lab measurements, not production field Core Web Vitals or a Lighthouse score.

| Measure (median of three) | Before | After |
|---|---:|---:|
| Largest Contentful Paint | 8.700 s | 1.908 s |
| Cumulative Layout Shift | 0.244 | 0.025 |
| DOMContentLoaded | 7.946 s | 7.591 s |
| Sum of long-task time beyond 50 ms in observation window | 1.473 s | 1.303 s |

The last row is a diagnostic, not Lighthouse TBT or field INP. No INP claim is made. Resource transfer totals exclude the navigation response and may omit cross-origin sizes without timing permission.

## Changes validated

Reserve carousel controls, type filters and initial catalogue space before JavaScript fills them. Keep the priority hero image visible on startup. Start the carousel paused; users may press Play, and manual navigation, keyboard, touch, offscreen pauses and reduced-motion behaviour remain tested. Owner-approved product-pool selection remains random.

The baseline automatically advanced slides after the initial paint. The after version avoids that unsolicited transition. This is a user-visible behaviour change, not a guarantee that every customer will see the same loading time.

## Separate catalogue follow-up — 14 November 2026

The base catalogue now loads from `shop/catalogue.json` with cache revalidation. The shop document drops from roughly 910 KB to 139 KB before compression. The same three-run mobile experiment gives median DOMContentLoaded 3.840 s (previously 7.591 s), LCP 2.380 s and CLS 0.021. LCP varied upwards relative to the prior 1.908 s sample; this is not an across-the-board speed claim. Raw runs are in `performance-results/mobile-split.json`.

The catalogue payload still downloads on a cold visit. This change separates parsing and allows independent caching; it does not eliminate catalogue bytes. Catalogue-ready time and field interaction latency have not been measured. Failure or malformed catalogue responses disable ordering and show Retry; both paths recover after successful reload in browser checks. 390px and 1366px checks show no errors or overflow.

## Remaining bottleneck

The page still loads the full catalogue and stock data. Filtering and normalization produce long main-thread tasks. Further work should avoid repeated full-list work and measure production compression/cache behaviour. The current change does not claim to solve all loading or interaction performance.

## Reproduce

From the repository root, with the bundled Playwright installation and Edge available:

`node tools/performance-audit.cjs performance-run.json`

The script binds only localhost and does not write to external services. It uses this workstation's bundled Playwright path; adjust that path on another machine. Compare the same data snapshot, network conditions and viewport. Raw before/after results are in `tools/performance-results/`.

Google recommends evaluating production performance with real-user data as well as lab tests: https://web.dev/articles/vitals
