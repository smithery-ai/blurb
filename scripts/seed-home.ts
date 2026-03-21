#!/usr/bin/env bun
// Seeds the "blurb" home folder into the local DB via the admin PUT endpoint
// Usage: bun scripts/seed-home.ts [base-url] [admin-token]

import { readFileSync } from "fs"
import { join } from "path"

const root = join(import.meta.dir, "..")
const baseUrl = process.argv[2] || "http://localhost:8787"
const token = process.argv[3] || "dev-admin-token"

const skill = readFileSync(join(root, ".claude/skills/blurb/SKILL.md"), "utf-8")
const widgetSpec = readFileSync(join(root, ".claude/skills/blurb/references/widget-spec.md"), "utf-8")
const hookListen = readFileSync(join(root, ".claude/skills/blurb/scripts/hook-listen.ts"), "utf-8")

// README is live content edited via API — not seeded here.
// To update README, use: curl -X PATCH https://blurb.md/~/public/blurb/README.md ...

const body = {
  title: "Blurb",
  description: "Beautiful collaborative gists for humans and agents. Check out the [readme](https://blurb.md/~/public/blurb/README.md)",
  command: "npx skills add https://blurb.md",
  files: [
    // .claude/skills/blurb
    { path: ".claude/skills/blurb/SKILL.md", content: skill },
    { path: ".claude/skills/blurb/references/widget-spec.md", content: widgetSpec },
    { path: ".claude/skills/blurb/scripts/hook-listen.ts", content: hookListen },
    // .agents mirror
    { path: ".agents/skills/blurb/SKILL.md", content: skill },
    { path: ".agents/skills/blurb/references/widget-spec.md", content: widgetSpec },
    { path: ".agents/skills/blurb/scripts/hook-listen.ts", content: hookListen },
  ],
}

const res = await fetch(`${baseUrl}/~/public/blurb`, {
  method: "PUT",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  },
  body: JSON.stringify(body),
})

const data = await res.json()
console.log(res.status, JSON.stringify(data, null, 2))
