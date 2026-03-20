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

const readme = `# Blurb

Beautiful collaborative gists for humans and agents.

Blurb gives you shareable folders of markdown files — rendered with rich widgets, inline comments, and real-time collaboration. Write in markdown, get charts, diagrams, maps, and more.

---

## Get Started

### As a Claude Code skill

\`\`\`bash
npx skills add smithery-ai/blurb
\`\`\`

Then ask Claude to publish anything — reports, plans, analyses — and it creates a shareable Blurb URL.

### Via the API

\`\`\`bash
curl -X POST https://blurb.md/~/public \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Hello","files":[{"path":"readme.md","content":"# Hello World"}]}'
\`\`\`

Your folder is live at \`https://blurb.md/~/public/{slug}\`.

---

## Widgets

Embed rich widgets using fenced code blocks in any markdown file.

### Charts

\`\`\`chart
{"config":{"type":"bar","data":{"labels":["Charts","Diagrams","Maps","Tables","Math","More"],"datasets":[{"label":"Widget types","data":[6,2,2,1,1,4]}]},"options":{"plugins":{"legend":{"display":false}}}}}
\`\`\`

### Diagrams

\`\`\`mermaid
graph LR
    A[Markdown] --> B[Blurb API]
    B --> C[Shareable URL]
    C --> D[Rich Preview]
    D --> E[Comments & Collaboration]
\`\`\`

### Sketches

\`\`\`sketch
{"width":600,"height":140,"elements":[{"type":"rect","x":20,"y":30,"width":120,"height":70,"fill":"#a5d8ff","color":"#1971c2","label":"Write"},{"type":"arrow","x1":140,"y1":65,"x2":220,"y2":65,"color":"#868e96"},{"type":"rect","x":220,"y":30,"width":120,"height":70,"fill":"#b2f2bb","color":"#2f9e44","label":"Publish"},{"type":"arrow","x1":340,"y1":65,"x2":420,"y2":65,"color":"#868e96"},{"type":"rect","x":420,"y":30,"width":120,"height":70,"fill":"#ffd8a8","color":"#e8590c","label":"Share"}]}
\`\`\`

Maps, timelines, calendars, globes, math, tables, diffs, embeds, and custom HTML — see [widget-spec.md](.claude/skills/blurb/references/widget-spec.md) for the full list.

---

## Collaborate

Select any text in a rendered file to leave an inline comment. Comments are threaded with replies — great for code reviews, feedback on reports, or async collaboration between humans and agents.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | \`/~/public\` | Create a folder |
| GET | \`/~/public/:slug\` | Get folder + files |
| PUT | \`/~/public/:slug/:path\` | Create/replace a file |
| PATCH | \`/~/public/:slug/:path\` | Edit file with diffs |
| DELETE | \`/~/public/:slug/:path\` | Delete a file |

Full API docs in [SKILL.md](.claude/skills/blurb/SKILL.md).

---

**This page is itself a Blurb folder.** Browse the sidebar to see the skill files that power it.
`

const body = {
  title: "Blurb",
  description: "Beautiful collaborative gists for humans and agents. Check out the [readme](https://blurb.md/~/public/blurb/README.md)",
  command: "npx skills add smithery-ai/blurb",
  files: [
    { path: "README.md", content: readme },
    { path: ".claude/skills/blurb/SKILL.md", content: skill },
    { path: ".claude/skills/blurb/references/widget-spec.md", content: widgetSpec },
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
