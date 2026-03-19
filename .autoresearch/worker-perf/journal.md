# Worker Perf — Experiment Journal

## Baseline

### Local (neat-bird-6139 — 10 files, 20 comments)
- p50: 4.8 ms | p95: 6.1 ms | max: 9.2 ms

### Production (warm-cat-3575 — 2 files, 0 comments)
- p50: 92 ms | p95: 162 ms | max: 383 ms
- **20x slower than local** — network latency between worker and D1 dominates.
- Each sequential query adds ~30-40ms. Reducing round-trips is the #1 lever.

---

## Experiment 1: Single JOIN query (replacing 4 sequential queries)
- **Hypothesis:** Replace 4 sequential D1 queries in `getFolder()` with a single LEFT JOIN across folders→files→comments→replies. Denormalize in JS.
- **Change:** Rewrote `getFolder()` in `src/db.ts` — one query with 4 LEFT JOINs, dedup with Maps and Sets.
- **Local result:** p50: 3.3ms (was 4.8), p95: 4.6ms (was 6.1) — **31% faster**
- **Prod result (bold-ray-2188, 10 files, 20 comments):** p50: 88ms, p95: 158ms
  - Comparable to baseline's 2-file/0-comment measurement (p50: 92, p95: 162), despite 5x more data.
- **Verdict: KEPT** — eliminates 3 network round-trips on production D1.

---

## Experiment 2: Cache-Control headers
- **Hypothesis:** Add `s-maxage=60, stale-while-revalidate=300` to GET responses — CF CDN caches at edge.
- **Change:** Added Cache-Control headers to folder and file GET routes.
- **Prod result:** p50: 94ms (was 88), p95: 197ms (was 158) — no improvement.
- **Analysis:** `s-maxage` only helps when requests go through CF CDN cache, not direct worker invocation from curl. Helps browsers and repeat visitors, not server p95.
- **Verdict: KEPT** (no perf cost, benefits browser caching) but doesn't improve our metric.

---

## Experiment 3: Split JOIN — batch metadata + content separately
- **Hypothesis:** The JOIN duplicates `f.content` across every comment/reply row. Use `db.batch()` to run a lightweight metadata JOIN + separate content query in one round-trip.
- **Change:** Two batched queries instead of one JOIN.
- **Local:** p50: 3.1ms (was 3.3), p95: 4.1ms (was 4.6)
- **Prod:** p50: 95ms, p95: 176ms — no improvement vs single JOIN (88ms/158ms)
- **Analysis:** With 10 files × 5KB, the duplicated content isn't a bottleneck. `db.batch()` adds overhead that offsets any savings.
- **Verdict: REVERTED** — simpler single JOIN is equally fast.

---

## Experiment 4: Inline folder data in HTML (SSR lite)
- **Hypothesis:** Eliminate client-side JSON fetch by injecting folder data as `window.__FOLDER_DATA__` in the HTML response. Browser gets data on first paint.
- **Change:** Added `serveSPAWithData()` — reads `index.html`, injects `<script>window.__FOLDER_DATA__=...</script>`. Client consumes inlined data before falling back to fetch.
- **HTML response (prod, 10 files, 20 comments):** p50: 109ms, p95: 157ms
- **Impact:** Previously browser needed HTML (~50ms) + JS download + JSON fetch (~90ms) = ~140ms minimum before data available. Now data arrives with HTML in a single request (~110ms).
- **Verdict: KEPT** — eliminates 1 network round-trip from critical rendering path.

---
