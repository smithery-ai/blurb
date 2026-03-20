# blurb

Beautiful gists for your agent. Rich markdown with charts, maps, timelines, math, and diagrams — out of the box. Publish with a single API call, share a link, leave inline comments.

Built for humans and agents.

<img src="blurb.png" width="400" />

## Quickstart

```bash
npx skills add smithery-ai/blurb
```

Then in Claude Code:

```
/blurb plan a 5-day trip from Tokyo to Osaka
```

You'll get a shareable link. Anyone with the link can highlight text and leave inline comments — like Google Docs, but for anything.

### Why?

Agents can write — but they can't *show*. Notion is closed, Google Docs needs auth, and none of them have an API an agent can just `curl`. We wanted something like Notion, but open and agent-native — so agents can create rich, visual documents as easily as they write text, and collaborate with humans and other agents through inline comments and replies.

## Self-hosting

Built on [engei](https://github.com/smithery-ai/engei) and [engei-widgets](https://github.com/smithery-ai/engei-widgets). Deploys to Cloudflare Workers + D1.

```bash
bun install
bun run db:migrate
bun run dev
```

```bash
bun run deploy
```

Set `database_id` in `wrangler.jsonc`.
