/**
 * Sync local .claude/skills/blurb/ files to the prod blurb folder.
 *
 * Usage: bun run scripts/sync-skill.ts
 *
 * Reads all files under .claude/skills/blurb/ and PUTs each one
 * to https://blurb.md/~/public/blurb/{path}.
 *
 * Requires BLURB_TOKEN env var (or reads from .dev.vars ADMIN_TOKEN).
 */
import { readdir, readFile } from "fs/promises"
import { join, relative } from "path"

const BASE = "https://blurb.md"
const SLUG = "blurb"
const SKILL_DIR = join(import.meta.dir, "../.claude/skills/blurb")

// Try BLURB_TOKEN env, then Infisical, then .dev.vars
let token = process.env.BLURB_TOKEN
if (!token) {
  try {
    const proc = Bun.spawnSync(["infisical", "secrets", "get", "ADMIN_TOKEN", "--path=/apps/blurb", "--env=prod", "--plain", "--silent"])
    const val = proc.stdout.toString().trim()
    if (val) token = val
  } catch {}
}
if (!token) {
  try {
    const devVars = await readFile(join(import.meta.dir, "../.dev.vars"), "utf-8")
    const match = devVars.match(/ADMIN_TOKEN\s*=\s*"?([^"\n]+)"?/)
    if (match) token = match[1]
  } catch {}
}
if (!token) {
  console.error("Set BLURB_TOKEN, configure Infisical, or set ADMIN_TOKEN in .dev.vars")
  process.exit(1)
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await walk(full))
    else files.push(full)
  }
  return files
}

const files = await walk(SKILL_DIR)

for (const file of files) {
  const relPath = ".claude/skills/blurb/" + relative(SKILL_DIR, file)
  const content = await readFile(file, "utf-8")

  const res = await fetch(`${BASE}/~/public/${SLUG}/${relPath}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ content }),
  })

  const status = res.status
  const body = await res.json() as any
  const action = body.created ? "created" : "updated"
  console.log(`${status === 200 || status === 201 ? "✓" : "✗"} ${relPath} (${action}, ${content.length} chars)`)
}

console.log("\nDone. View at: https://blurb.md/~/public/blurb")
