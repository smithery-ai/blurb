# Worker Performance Optimization

## Metric

**p95 response time (ms)** for `GET /~/public/:slug` (JSON, full folder load).

This is the critical path — every page view hits it. Measured locally against the dev server with a seeded test folder.

### Measurement

Seed a test folder with 10 files, 20 comments, 10 replies, then measure:

```bash
# Seed (run once)
curl -s -X POST http://localhost:8787/~/public \
  -H "Content-Type: application/json" \
  -d "$(node -e "
const files = Array.from({length: 10}, (_, i) => ({
  path: 'file-' + i + '.md',
  content: '# File ' + i + '\n' + 'x'.repeat(5000)
}));
console.log(JSON.stringify({title: 'perf-test', files}))
")" | jq -r '.slug'

# Measure p95 over 50 requests
SLUG=<slug-from-above>
for i in $(seq 1 50); do
  curl -s -o /dev/null -w '%{time_total}\n' \
    -H 'Accept: application/json' \
    "http://localhost:8787/~/public/$SLUG"
done | sort -n | awk 'NR==int(0.95*50){print $1 * 1000 " ms"}'
```

## Scope

- `src/db.ts` — query optimization, batching, JOINs
- `src/index.tsx` — response construction, caching headers
- `src/slug.ts` — minor

**Do NOT touch:**
- `app/` (frontend) — separate concern
- `migrations/` — no schema changes (would require migration)
- The measurement script itself

## Strategy

### Direction 1: Parallelize sequential queries (HIGH)
`getFolder()` runs 4 sequential queries: folder → files → comments → replies.
- folder + files could be a single JOIN
- comments + replies could be a single JOIN
- At minimum, batch independent queries with `db.batch()`

### Direction 2: Use D1 batch API
D1 supports `db.batch([stmt1, stmt2, ...])` which runs all statements in a single round-trip. The `getFolder` function does 4 sequential `.prepare().all()` calls — batch them.

### Direction 3: Reduce query count with JOINs
Replace the 4-query waterfall with 1-2 queries using JOINs:
- `SELECT files.*, comments.*, replies.* FROM files LEFT JOIN comments LEFT JOIN replies WHERE folder_id = ?`
- Denormalize in JS after

### Direction 4: Cache headers
Add `Cache-Control` for immutable content. Folders are rarely updated after creation.

### Direction 5: Slim JSON response
- Don't send file `content` in folder listing — lazy load per file
- Send content only for the first/active file

## Budget

10 experiments max.

## Invariants

- All existing API endpoints must continue to work (same request → same response shape)
- No schema migrations
- No npm dependency additions
