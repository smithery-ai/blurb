# Project: sono-worker

## Dev

- Use `bun` (not npm/yarn/pnpm)
- Local dev server: `bun run dev` (runs `wrangler dev` with hot reload)
- Test changes locally before deploying — only deploy (`bun run deploy`) when explicitly asked
- Build: `bun run build`
- DB migrations (local): `bun run db:migrate`
- DB migrations (prod): `bun run db:migrate:prod`
