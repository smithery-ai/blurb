---
name: blurb-engineer
description: "Operational knowledge for developing the Blurb platform (blurb.md). Covers the monorepo build chain (engei-widgets → engei → blurb), Cloudflare Workers deployment, D1 migrations, Infisical secrets, testing with Miniflare, and live content editing via the Blurb API. Use when: working on blurb source code, deploying blurb, running blurb tests, debugging blurb issues, editing blurb.md content, managing blurb secrets, or any task in the blurb-workspace monorepo. Triggers on: 'blurb deploy', 'blurb tests', 'blurb migration', 'edit blurb content', 'blurb admin', 'blurb secrets', or when working in the blurb-workspace directory."
---

# Blurb Engineer

Operational guide for developing the Blurb platform at `blurb-workspace/`.

## Monorepo Structure

```
blurb-workspace/
├── engei-widgets/  — Widget plugins (Chart, Map, Mermaid, etc.)
├── engei/          — React editor/preview library (CodeMirror + markdown)
└── blurb/          — Cloudflare Worker app (Hono + D1)
    ├── app/        — Client SPA (React, mounted at /app/main.tsx)
    ├── src/        — Worker server (Hono routes, D1 queries)
    ├── lib/        — Shared utils (fern-core.ts)
    └── migrations/ — D1 SQL migrations
```

## Build Chain

**Critical**: `wrangler dev` does NOT hot-reload changes in `engei-widgets` or `engei`. Rebuild the full chain:

```bash
cd engei-widgets && bun run build
cd ../engei && bun run build
cd ../blurb && bun run build
```

Then reload the browser. For blurb-only changes (app/, src/), just `cd blurb && bun run build`.

## Dev Server

```bash
cd blurb && bun run dev    # wrangler dev on localhost:8787
```

Always test on **localhost:8787**, not production.

## Secrets (Infisical)

Secrets are stored in Infisical under the `prod` environment:

```bash
# List folders
infisical secrets folders get --env prod

# Blurb secrets are at /apps/blurb
infisical secrets --env prod --path /apps/blurb
```

Key secrets:
- `ADMIN_TOKEN` — superuser token for prod API (bypasses all folder auth)

Local dev uses `.dev.vars` file:
```
ADMIN_TOKEN=dev-admin-token
```

## Database (D1)

```bash
# Apply migrations locally
bun run db:migrate

# Apply migrations to prod
bun run db:migrate:prod

# Query prod DB directly
npx wrangler d1 execute sono-worker-db --remote --command "SELECT ..."
```

Migrations are in `blurb/migrations/`. Numbered sequentially (`0001_init.sql`, `0002_...`).

## Testing

Tests use Vitest + Miniflare with real D1. Test setup auto-applies all migration files from `migrations/` directory — no manual schema updates needed.

```bash
cd blurb && bun run test        # run once
cd blurb && bun run test:watch  # watch mode
cd engei && bun run test        # editor library tests
```

Test files: `src/__tests__/*.test.ts`. Setup: `src/__tests__/setup.ts`.

Helper: `request(path, init)` — makes requests against the Hono app with real D1 bindings. Use `TEST_ADMIN_TOKEN` for authenticated requests.

## Deploying

```bash
cd blurb && bun run deploy   # vite build + wrangler deploy
```

Deploys to:
- `blurb.md` (custom domain)
- `www.blurb.md` (custom domain)

Account: Smithery (`c4cf21d8a5e8878bc3c92708b1f80193`). If wrangler asks which account, set `CLOUDFLARE_ACCOUNT_ID`.

## Editing Live Content

The blurb homepage (`blurb.md/~/public/blurb`) is itself a Blurb folder. Edit via API:

```bash
TOKEN="$(infisical secrets get ADMIN_TOKEN --env prod --path /apps/blurb --plain)"

# Patch content (old_str/new_str diffs)
curl -X PATCH "https://blurb.md/~/public/blurb/README.md" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"updates":[{"old_str":"old text","new_str":"new text"}]}'

# Replace entire file
curl -X PUT "https://blurb.md/~/public/blurb/README.md" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"content":"# New content"}'
```

## Content Negotiation

File routes serve different content based on `Accept` header:
- `Accept: text/html` (browsers) → SPA with inlined folder data
- `Accept: application/json` → JSON file object
- `Accept: */*` (curl, agents) → raw markdown content

## Auth Model

- **Per-folder token**: SHA-256 hash stored in `token_hash` column. Plaintext returned once on creation.
- **ADMIN_TOKEN**: Superuser, bypasses all folder auth. Set in Infisical / `.dev.vars`.
- **Mode (chmod)**: Two-digit octal string on folders. First digit = owner perms, second = public. Bits: `4=read, 2=comment, 1=write`. Default `'76'`.

## Key Files

| File | Purpose |
|------|---------|
| `blurb/src/index.tsx` | All Hono routes, auth, webhooks, OG generation |
| `blurb/src/db.ts` | D1 queries, permission helpers, validation |
| `blurb/src/room.ts` | Durable Object for WebSocket real-time updates |
| `blurb/app/FolderView.tsx` | Main client component (file tree, editor, comments) |
| `blurb/app/app.css` | App-level styles (layout, sidebar, mobile, share modal) |
| `engei/src/styles/variables.css` | Theme CSS variables (dark/light mode colors) |
| `engei/src/styles/engei.css` | Editor/preview styles (typography, code blocks, comments) |
| `engei/src/preview/MarkdownPreview.tsx` | Markdown renderer with comment support |
| `engei/src/Editor.tsx` | Top-level editor component |
| `blurb/lib/fern-core.ts` | ASCII art fern generator (landing page) |

## Gotchas

- **Build order matters**: Always widgets → engei → blurb. Stale builds cause confusing bugs.
- **D1 exec vs prepare**: `db.exec()` can't handle multi-line CREATE TABLE in Miniflare tests. Use `db.prepare(stmt).run()` for each statement.
- **Theme sync**: CSS vars are set in three places — `variables.css` (engei), `FolderView.tsx` (runtime), `index.html` (flash prevention). Keep them in sync.
- **Fern colors**: Light mode fern palettes need to be darker than dark mode (counter-intuitive) — they're against white/cream bg.
- **Mobile sidebar**: Inner content was locked to 240px width but the sidebar overlay is 280px. The `@media (max-width: 640px)` block overrides to `width: 100%`.
