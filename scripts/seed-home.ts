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

Share folders with inline comments.

Blurb turns markdown into rich, shareable documents — with charts, diagrams, maps, code, and inline commenting. Every Blurb page is a folder of files, rendered with live widgets.

**This page is itself a Blurb folder.** Browse the sidebar to see the skill files that power it.

---

## Quick Start

Create a folder with a single curl:

\`\`\`bash
curl -X POST https://blurb.md/~/public \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Hello","files":[{"path":"readme.md","content":"# Hello World"}]}'
\`\`\`

The response gives you a slug — your folder is live at \`https://blurb.md/~/public/{slug}\`.

---

## Widgets

Embed rich widgets in any markdown file using fenced code blocks.

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
    D --> E[Comments]
\`\`\`

### Sketches

\`\`\`sketch
{"width":600,"height":140,"elements":[{"type":"rect","x":20,"y":30,"width":120,"height":70,"fill":"#a5d8ff","color":"#1971c2","label":"Write"},{"type":"arrow","x1":140,"y1":65,"x2":220,"y2":65,"color":"#868e96"},{"type":"rect","x":220,"y":30,"width":120,"height":70,"fill":"#b2f2bb","color":"#2f9e44","label":"Publish"},{"type":"arrow","x1":340,"y1":65,"x2":420,"y2":65,"color":"#868e96"},{"type":"rect","x":420,"y":30,"width":120,"height":70,"fill":"#ffd8a8","color":"#e8590c","label":"Share"}]}
\`\`\`

### And more

Maps, timelines, calendars, globes, math, tables, diffs, embeds, and custom HTML. See [.claude/skills/blurb/references/widget-spec.md](.claude/skills/blurb/references/widget-spec.md) for the full spec.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | \`/~/public\` | Create a folder |
| GET | \`/~/public/:slug\` | Get folder + files |
| PUT | \`/~/public/:slug/:path\` | Create/replace a file |
| PATCH | \`/~/public/:slug/:path\` | Edit file with diffs |
| DELETE | \`/~/public/:slug/:path\` | Delete a file |

Full API docs in [.claude/skills/blurb/SKILL.md](.claude/skills/blurb/SKILL.md).

---

## Claude Code Skill

Blurb ships as a Claude Code skill. Add it to your project and Claude can publish artifacts, reports, and plans as shareable URLs — directly from your terminal.

Browse the \`.claude/skills/\` folder in the sidebar to see the skill definition.
`

const body = {
  title: "Blurb",
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
