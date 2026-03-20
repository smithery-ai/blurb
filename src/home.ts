// Static home folder served at /
// This makes the landing page a Blurb folder, dogfooding the product.
//
// To update skill content: run `bun scripts/sync-home.ts`

import { SKILL_MD, WIDGET_SPEC_MD } from "./home-content"

const INDEX_MD = `# Blurb

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

export const HOME_FOLDER = {
  id: "home",
  slug: "blurb",
  title: "Blurb",
  createdAt: "2025-01-01T00:00:00Z",
  files: [
    {
      id: "home-index",
      path: "README.md",
      content: INDEX_MD,
      language: null,
      comments: [],
    },
    {
      id: "home-skill",
      path: ".claude/skills/blurb/SKILL.md",
      content: SKILL_MD,
      language: null,
      comments: [],
    },
    {
      id: "home-widget-spec",
      path: ".claude/skills/blurb/references/widget-spec.md",
      content: WIDGET_SPEC_MD,
      language: null,
      comments: [],
    },
  ],
}
