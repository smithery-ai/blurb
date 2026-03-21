#!/usr/bin/env bun
// Seeds skill files into the "blurb" home folder via per-file PUT.
// Does NOT touch README or other live content.
// Usage: bun scripts/seed-home.ts [base-url] [admin-token]

import { readFileSync } from "fs"
import { join } from "path"

const root = join(import.meta.dir, "..")
const baseUrl = process.argv[2] || "http://localhost:8787"
const token = process.argv[3] || "dev-admin-token"

const skill = readFileSync(join(root, ".claude/skills/blurb/SKILL.md"), "utf-8")
const widgetSpec = readFileSync(join(root, ".claude/skills/blurb/references/widget-spec.md"), "utf-8")
const hookListen = readFileSync(join(root, ".claude/skills/blurb/scripts/hook-listen.ts"), "utf-8")

const files = [
  // .claude/skills/blurb
  { path: ".claude/skills/blurb/SKILL.md", content: skill },
  { path: ".claude/skills/blurb/references/widget-spec.md", content: widgetSpec },
  { path: ".claude/skills/blurb/scripts/hook-listen.ts", content: hookListen },
  // .agents mirror
  { path: ".agents/skills/blurb/SKILL.md", content: skill },
  { path: ".agents/skills/blurb/references/widget-spec.md", content: widgetSpec },
  { path: ".agents/skills/blurb/scripts/hook-listen.ts", content: hookListen },
]

// Upsert each file individually — does not delete existing files like README
for (const file of files) {
  const res = await fetch(`${baseUrl}/~/public/blurb/${file.path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ content: file.content }),
  })
  const status = res.status
  console.log(`${status === 201 ? "created" : "updated"} ${file.path}`)
}
