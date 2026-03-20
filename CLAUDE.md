# Project: sono-worker

## Dev

- Use `bun` (not npm/yarn/pnpm)
- Local dev server: `bun run dev` (runs `wrangler dev` with hot reload)
- Test changes locally before deploying — only deploy (`bun run deploy`) when explicitly asked
- Build: `bun run build`
- **Build chain for dependency changes**: `wrangler dev` does NOT hot-reload changes in `engei-widgets` or `engei`. You must rebuild the full chain and then rebuild blurb:
  1. `cd engei-widgets && bun run build`
  2. `cd engei && bun run build`
  3. `cd blurb && bun run build`
  4. Reload the browser (the wrangler dev server serves from `dist/`)
- DB migrations (local): `bun run db:migrate`
- DB migrations (prod): `bun run db:migrate:prod`
