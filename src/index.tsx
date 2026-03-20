import { Hono } from "hono"
import { uniqueSlug, anonName } from "./slug"
import * as db from "./db"
import { hashStr, renderFernSVG } from "../lib/fern-core"
import YAML from "yaml"


type Bindings = { DB: D1Database; ASSETS: Fetcher; ADMIN_TOKEN?: string }
type HonoEnv = { Bindings: Bindings }

/** Validate webhook URL — must be HTTPS (or HTTP localhost in dev). Blocks SSRF. */
function isValidWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === "https:") return true
    // Allow HTTP only for localhost/127.0.0.1 (dev/testing)
    if (parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")) return true
    return false
  } catch {
    return false
  }
}

/** Fire-and-forget webhook POST. 10s timeout, swallows errors. */
function fireWebhook(url: string, payload: object) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: controller.signal,
  }).catch(() => {}).finally(() => clearTimeout(timeout))
}

/** Safe waitUntil — falls back to fire-and-forget if no ExecutionContext */
function safeWaitUntil(c: any, promise: Promise<any>) {
  try {
    c.executionCtx.waitUntil(promise)
  } catch {
    // No ExecutionContext (e.g., in tests) — just let it run
  }
}

/** Create a hook on hook.new — returns ingest_url + manage details, or null on failure. */
async function createHook(): Promise<{
  hook_id: string
  ingest_url: string
  manage_url: string
  manage_token: string
} | null> {
  try {
    const res = await fetch("https://hook.new/hooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    if (!res.ok) return null
    const data = await res.json() as any
    // Validate required fields
    if (!data?.hook_id || !data?.ingest_url || !data?.manage_url || !data?.manage_token) return null
    if (!data.ingest_url.startsWith("https://")) return null
    return data
  } catch {
    return null
  }
}


const app = new Hono<HonoEnv>()

// ─── Helper: serve SPA ─────────────────────────────────────

function serveSPA(c: any) {
  const url = new URL(c.req.url)
  return c.env.ASSETS.fetch(new Request(new URL("/index.html", url.origin)))
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/** Serve SPA with folder data inlined to eliminate client-side JSON fetch */
async function serveSPAWithData(c: any, data: any) {
  const url = new URL(c.req.url)
  const htmlRes = await c.env.ASSETS.fetch(new Request(new URL("/index.html", url.origin)))
  const html = await htmlRes.text()
  const json = JSON.stringify(data).replace(/</g, "\\u003c")

  // OG meta tags for link previews
  const ogTags = data.slug ? `
    <meta property="og:title" content="${escapeHtml(data.title || "Blurb")}" />
    <meta property="og:description" content="${escapeHtml((data.description || "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"))}" />
    <meta property="og:image" content="${url.origin}/~/public/${data.slug}/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${url.origin}/~/public/${data.slug}" />
    <meta name="twitter:card" content="summary_large_image" />
    <title>${escapeHtml(data.title || "Blurb")}</title>` : ""

  const injected = html.replace(
    "</head>",
    `${ogTags}\n<script>window.__FOLDER_DATA__=${json}</script>\n</head>`,
  )
  return new Response(injected, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  })
}

// ─── Helper: parse @comments from path ─────────────────────

function parseCommentPath(raw: string) {
  const idx = raw.indexOf("/@comments")
  if (idx === -1) return null
  const filePath = raw.slice(0, idx)
  const rest = raw.slice(idx + "/@comments".length)
  if (!rest || rest === "/") return { filePath, commentId: null, isReplies: false }
  const parts = rest.replace(/^\//, "").split("/")
  return {
    filePath,
    commentId: parts[0] || null,
    isReplies: parts[1] === "replies",
  }
}

// ─── Well-known skills discovery (RFC 8615) ─────────────────
// Per-folder: /~/public/:slug/.well-known/skills/index.json
// Also exposed at root for the "blurb" home folder

/** Parse YAML frontmatter name/description from SKILL.md content */
function parseSkillFrontmatter(content: string): { name: string; description: string } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null
  try {
    const fm = YAML.parse(match[1])
    if (!fm?.name || !fm?.description) return null
    return { name: fm.name, description: fm.description }
  } catch {
    return null
  }
}

/** Build well-known skills index + file map from a folder's files */
function buildSkillsFromFolder(files: { path: string; content: string }[]) {
  // Find all SKILL.md files
  const skillFiles = files.filter(f => f.path.endsWith("/SKILL.md") || f.path === "SKILL.md")
  const skills: { name: string; description: string; files: string[]; dir: string }[] = []

  for (const sf of skillFiles) {
    const fm = parseSkillFrontmatter(sf.content)
    if (!fm) continue

    // Skill dir is the parent of SKILL.md
    const dir = sf.path.includes("/") ? sf.path.replace(/\/SKILL\.md$/, "") : ""
    const prefix = dir ? `${dir}/` : ""

    // Collect all files under this skill dir, relative to it
    const relFiles = files
      .filter(f => f.path === sf.path || (prefix && f.path.startsWith(prefix) && f.path !== sf.path))
      .map(f => prefix ? f.path.slice(prefix.length) : f.path)

    skills.push({ name: fm.name, description: fm.description, files: relFiles, dir })
  }

  return skills
}

// Per-folder well-known: /~/public/:slug/.well-known/skills/index.json
app.get("/~/public/:slug/.well-known/skills/index.json", async (c) => {
  const folder = await db.getFolder(c.env.DB, c.req.param("slug"))
  if (!folder) return c.json({ error: "Not found" }, 404)

  const skills = buildSkillsFromFolder(folder.files)
  return c.json(
    { skills: skills.map(s => ({ name: s.name, description: s.description, files: s.files })) },
    200,
    { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  )
})

// Per-folder well-known: /~/public/:slug/.well-known/skills/:skill/:path
app.get("/~/public/:slug/.well-known/skills/:skill/:path{.+}", async (c) => {
  const folder = await db.getFolder(c.env.DB, c.req.param("slug"))
  if (!folder) return c.json({ error: "Not found" }, 404)

  const skillName = c.req.param("skill")
  const filePath = c.req.param("path")
  const skills = buildSkillsFromFolder(folder.files)
  const skill = skills.find(s => s.name === skillName)
  if (!skill) return c.text("Not found", 404)

  const fullPath = skill.dir ? `${skill.dir}/${filePath}` : filePath
  const file = folder.files.find((f: any) => f.path === fullPath)
  if (!file) return c.text("Not found", 404)

  const ct = filePath.endsWith(".json") ? "application/json" : "text/markdown"
  return new Response(file.content, {
    headers: { "Content-Type": ct, "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  })
})

// Root well-known aliases to the "blurb" home folder
app.get("/.well-known/skills/index.json", async (c) => {
  return c.redirect(`/~/public/blurb/.well-known/skills/index.json`, 302)
})

app.get("/.well-known/skills/:skill/:path{.+}", async (c) => {
  return c.redirect(`/~/public/blurb/.well-known/skills/${c.req.param("skill")}/${c.req.param("path")}`, 302)
})

// ─── OpenAPI spec ────────────────────────────────────────────

app.get("/openapi.json", (c) => {
  return c.json({
    openapi: "3.1.0",
    info: {
      title: "Blurb",
      description: "Beautiful collaborative gists for humans and agents. Create shareable folders of markdown files with rich embedded widgets.",
      version: "1.0.0",
    },
    servers: [{ url: "https://blurb.md" }],
    paths: {
      "/~/public": {
        post: {
          operationId: "createFolder",
          summary: "Create a folder with files",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["files"],
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    command: { type: "string", description: "Install command shown on the landing page" },
                    token: { type: "string", minLength: 32, description: "Auth token for future edits. Auto-generated if omitted." },
                    webhook_url: { type: "string", format: "uri", description: "URL to receive comment/reply webhooks" },
                    files: {
                      type: "array",
                      minItems: 1,
                      items: {
                        type: "object",
                        required: ["path", "content"],
                        properties: {
                          path: { type: "string", description: "File path (e.g. 'report.md' or 'data/results.md')" },
                          content: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Folder created", content: { "application/json": { schema: { type: "object", properties: { id: { type: "string" }, slug: { type: "string" }, token: { type: "string" } } } } } },
            "400": { description: "Validation error" },
          },
        },
      },
      "/~/public/{slug}": {
        get: {
          operationId: "getFolder",
          summary: "Get folder with all files and comments",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Folder data" },
            "404": { description: "Not found" },
          },
        },
        put: {
          operationId: "replaceFolder",
          summary: "Create or replace a folder at a specific slug",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["files"],
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    command: { type: "string" },
                    token: { type: "string", minLength: 32 },
                    webhook_url: { type: "string", format: "uri" },
                    files: {
                      type: "array",
                      minItems: 1,
                      items: {
                        type: "object",
                        required: ["path", "content"],
                        properties: {
                          path: { type: "string" },
                          content: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Folder replaced" },
            "201": { description: "Folder created" },
            "400": { description: "Validation error" },
            "403": { description: "Forbidden — invalid token" },
          },
        },
      },
      "/~/public/{slug}/{path}": {
        get: {
          operationId: "getFile",
          summary: "Read a single file",
          parameters: [
            { name: "slug", in: "path", required: true, schema: { type: "string" } },
            { name: "path", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "File content" },
            "404": { description: "Not found" },
          },
        },
        put: {
          operationId: "replaceFile",
          summary: "Create or replace a file (upsert)",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "slug", in: "path", required: true, schema: { type: "string" } },
            { name: "path", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["content"], properties: { content: { type: "string" } } } } },
          },
          responses: {
            "200": { description: "File replaced" },
            "201": { description: "File created" },
            "403": { description: "Forbidden" },
            "404": { description: "Folder not found" },
          },
        },
        patch: {
          operationId: "editFile",
          summary: "Edit file with old_str/new_str diffs",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "slug", in: "path", required: true, schema: { type: "string" } },
            { name: "path", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["updates"],
                  properties: {
                    updates: {
                      type: "array",
                      minItems: 1,
                      items: {
                        type: "object",
                        required: ["old_str", "new_str"],
                        properties: {
                          old_str: { type: "string" },
                          new_str: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "All edits applied" },
            "207": { description: "Some edits failed (partial success)" },
            "403": { description: "Forbidden" },
            "404": { description: "Not found" },
          },
        },
        delete: {
          operationId: "deleteFile",
          summary: "Delete a file and its comments",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "slug", in: "path", required: true, schema: { type: "string" } },
            { name: "path", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Deleted" },
            "403": { description: "Forbidden" },
            "404": { description: "Not found" },
          },
        },
      },
      "/~/public/{slug}/{path}/@comments": {
        post: {
          operationId: "addComment",
          summary: "Add an inline comment to a file",
          parameters: [
            { name: "slug", in: "path", required: true, schema: { type: "string" } },
            { name: "path", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["anchor", "body"],
                  properties: {
                    anchor: { type: "object", description: "Text selection anchor" },
                    body: { type: "string" },
                    author: { type: "string", description: "Defaults to anonymous name" },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Comment created" },
            "404": { description: "File not found" },
          },
        },
      },
      "/~/public/{slug}/{path}/@comments/{commentId}": {
        delete: {
          operationId: "deleteComment",
          summary: "Delete a comment",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "slug", in: "path", required: true, schema: { type: "string" } },
            { name: "path", in: "path", required: true, schema: { type: "string" } },
            { name: "commentId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Deleted" },
            "403": { description: "Forbidden" },
          },
        },
      },
      "/~/public/{slug}/{path}/@comments/{commentId}/replies": {
        post: {
          operationId: "addReply",
          summary: "Add a reply to a comment",
          parameters: [
            { name: "slug", in: "path", required: true, schema: { type: "string" } },
            { name: "path", in: "path", required: true, schema: { type: "string" } },
            { name: "commentId", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["body"],
                  properties: {
                    body: { type: "string" },
                    author: { type: "string", description: "Defaults to anonymous name" },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Reply created" },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Token returned when creating a folder",
        },
      },
    },
  }, 200, { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" })
})

// ─── Auth helpers ────────────────────────────────────────────

async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token)
  const hash = await crypto.subtle.digest("SHA-256", data)
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("")
}

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("")
}

/** Check Authorization header against folder's token_hash or ADMIN_TOKEN. Returns error response or null if authorized. */
async function requireFolderAuth(c: any, slug: string): Promise<Response | null> {
  const auth = c.req.header("authorization") || ""
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : ""

  if (!bearer) return c.json({ error: "Authorization required" }, 401)

  // Superuser: ADMIN_TOKEN
  if (c.env.ADMIN_TOKEN && bearer === c.env.ADMIN_TOKEN) return null

  const folder = await db.getFolderTokenHash(c.env.DB, slug)
  if (!folder) return c.json({ error: "Not found" }, 404)

  // Legacy folder with no token — only ADMIN_TOKEN can mutate
  if (!folder.tokenHash) return c.json({ error: "Forbidden" }, 403)

  const hash = await hashToken(bearer)
  if (hash !== folder.tokenHash) return c.json({ error: "Forbidden" }, 403)

  return null
}

// ─── Home redirect ───────────────────────────────────────────

app.get("/", async (c) => {
  const accept = c.req.header("Accept") || ""
  if (accept.includes("text/html")) return c.redirect("/~/public/blurb")
  const file = await db.getFileBySlugAndPath(c.env.DB, "blurb", ".claude/skills/blurb/SKILL.md")
  if (!file) return c.text("SKILL.md not found", 404)
  return c.text(file.content as string)
})

// ─── Folder routes ──────────────────────────────────────────

app.post("/~/public", async (c) => {
  const body = await c.req.json<{
    title?: string
    description?: string
    command?: string
    token?: string
    webhook_url?: string
    files: { path: string; content: string }[]
  }>()

  if (!body.files?.length) return c.json({ error: "At least one file required" }, 400)

  const landingErr = db.validateLanding(body.description, body.command)
  if (landingErr) return c.json({ error: landingErr }, 400)

  for (const f of body.files) {
    const err = db.validatePath(f.path)
    if (err) return c.json({ error: `Invalid path "${f.path}": ${err}` }, 400)
  }

  if (body.webhook_url && !isValidWebhookUrl(body.webhook_url)) return c.json({ error: "webhook_url must be a valid HTTPS URL" }, 400)

  if (body.token && body.token.length < 32) return c.json({ error: "token must be at least 32 characters" }, 400)
  const token = body.token || generateToken()
  const tokenHash = await hashToken(token)
  const slug = await uniqueSlug(c.env.DB)

  // Auto-create a hook on hook.new unless caller provided their own webhook_url
  let webhookUrl = body.webhook_url
  let hook: Awaited<ReturnType<typeof createHook>> = null
  if (!webhookUrl) {
    hook = await createHook()
    if (hook) webhookUrl = hook.ingest_url
  }

  const folder = await db.createFolder(c.env.DB, slug, body.title || "Untitled", body.files, {
    description: body.description,
    command: body.command,
    tokenHash,
    webhookUrl,
  })
  return c.json({
    ...folder,
    token,
    ...(hook ? { hook: { hook_id: hook.hook_id, ingest_url: hook.ingest_url, manage_url: hook.manage_url, manage_token: hook.manage_token } } : {}),
  }, 201)
})

// Create/replace folder with a specific slug
app.put("/~/public/:slug", async (c) => {
  const slug = c.req.param("slug")
  const body = await c.req.json<{
    title?: string
    description?: string
    command?: string
    token?: string
    webhook_url?: string
    files: { path: string; content: string }[]
  }>()

  if (!body.files?.length) return c.json({ error: "At least one file required" }, 400)

  const landingErr = db.validateLanding(body.description, body.command)
  if (landingErr) return c.json({ error: landingErr }, 400)

  for (const f of body.files) {
    const err = db.validatePath(f.path)
    if (err) return c.json({ error: `Invalid path "${f.path}": ${err}` }, 400)
  }

  if (body.webhook_url && !isValidWebhookUrl(body.webhook_url)) return c.json({ error: "webhook_url must be a valid HTTPS URL" }, 400)

  // Check if folder exists — if so, require auth to replace
  const existingMeta = await db.getFolderTokenHash(c.env.DB, slug)
  if (existingMeta) {
    const authErr = await requireFolderAuth(c, slug)
    if (authErr) return authErr

    // Must delete in order: replies → comments → files → folder (no CASCADE)
    await c.env.DB.prepare(`
      DELETE FROM replies WHERE comment_id IN (
        SELECT c.id FROM comments c JOIN files f ON c.file_id = f.id WHERE f.folder_id = ?
      )`).bind(existingMeta.id).run()
    await c.env.DB.prepare(`
      DELETE FROM comments WHERE file_id IN (
        SELECT id FROM files WHERE folder_id = ?
      )`).bind(existingMeta.id).run()
    await c.env.DB.prepare("DELETE FROM files WHERE folder_id = ?").bind(existingMeta.id).run()
    await c.env.DB.prepare("DELETE FROM folders WHERE id = ?").bind(existingMeta.id).run()
  }

  // For new folders: generate token. For replacements: preserve existing token_hash.
  let tokenHash: string | undefined
  let returnToken: string | undefined
  if (existingMeta) {
    tokenHash = existingMeta.tokenHash || undefined
  } else {
    if (body.token && body.token.length < 32) return c.json({ error: "token must be at least 32 characters" }, 400)
    const token = body.token || generateToken()
    tokenHash = await hashToken(token)
    returnToken = token
  }

  // Auto-create a hook on hook.new for new folders unless caller provided their own webhook_url
  let webhookUrl = body.webhook_url
  let hook: Awaited<ReturnType<typeof createHook>> = null
  if (!webhookUrl && !existingMeta) {
    hook = await createHook()
    if (hook) webhookUrl = hook.ingest_url
  }

  const folder = await db.createFolder(c.env.DB, slug, body.title || "Untitled", body.files, {
    description: body.description,
    command: body.command,
    tokenHash,
    webhookUrl,
  })
  const result: any = returnToken ? { ...folder, token: returnToken } : folder
  if (hook) result.hook = { hook_id: hook.hook_id, ingest_url: hook.ingest_url, manage_url: hook.manage_url, manage_token: hook.manage_token }
  return c.json(result, existingMeta ? 200 : 201)
})

app.get("/~/public/:slug", async (c) => {
  const accept = c.req.header("accept") || ""
  const folder = await db.getFolder(c.env.DB, c.req.param("slug"))
  if (!folder) return c.json({ error: "Not found" }, 404)

  if (accept.includes("application/json")) {
    c.header("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300")
    return c.json(folder)
  }
  return serveSPAWithData(c, folder)
})

// ─── OG image ────────────────────────────────────────────────

app.get("/~/public/:slug/og.svg", async (c) => {
  const folder = await db.getFolder(c.env.DB, c.req.param("slug"))
  if (!folder) return c.json({ error: "Not found" }, 404)

  const seed = hashStr(folder.files.map((f: any) => f.path + f.content).join(""))
  const svg = renderFernSVG({
    seed,
    title: folder.title,
    description: folder.description,
  })

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  })
})

app.get("/~/public/:slug/og.png", async (c) => {
  const folder = await db.getFolder(c.env.DB, c.req.param("slug"))
  if (!folder) return c.json({ error: "Not found" }, 404)

  const seed = hashStr(folder.files.map((f: any) => f.path + f.content).join(""))
  const svg = renderFernSVG({
    seed,
    title: folder.title,
    description: folder.description,
  })

  const { svgToPng } = await import("./resvg")
  const png = await svgToPng(svg, 1200)

  return new Response(png as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  })
})

// ─── File + comment routes ──────────────────────────────────

app.get("/~/public/:slug/:path{.+}", async (c) => {
  const slug = c.req.param("slug")
  const path = c.req.param("path")
  const comment = parseCommentPath(path)

  if (comment) {
    if (comment.commentId) {
      const result = await db.getComment(c.env.DB, comment.commentId)
      if (!result) return c.json({ error: "Not found" }, 404)
      return c.json(result)
    }
    const file = await db.getFileBySlugAndPath(c.env.DB, slug, comment.filePath)
    if (!file) return c.json({ error: "File not found" }, 404)
    const comments = await db.listComments(c.env.DB, file.id as string)
    return c.json(comments)
  }

  const accept = c.req.header("accept") || ""
  const file = await db.getFileBySlugAndPath(c.env.DB, slug, path)
  if (!file) {
    if (!accept.includes("application/json")) {
      // Browser navigating to a file path — try to load full folder for SSR
      const folder = await db.getFolder(c.env.DB, slug)
      if (folder) return serveSPAWithData(c, folder)
      return serveSPA(c)
    }
    return c.json({ error: "Not found" }, 404)
  }

  const cache = "public, s-maxage=60, stale-while-revalidate=300"
  if (accept.includes("text/markdown")) {
    return new Response(file.content as string, { headers: { "Content-Type": "text/markdown", "Cache-Control": cache } })
  }
  if (accept.includes("application/json")) {
    c.header("Cache-Control", cache)
    return c.json(file)
  }
  // Browser navigating directly to a file — inline full folder data
  const folder = await db.getFolder(c.env.DB, slug)
  if (folder) return serveSPAWithData(c, folder)
  return serveSPA(c)
})

app.put("/~/public/:slug/:path{.+}", async (c) => {
  const authErr = await requireFolderAuth(c, c.req.param("slug"))
  if (authErr) return authErr

  const body = await c.req.json<{ content: string }>()
  if (!body.content && body.content !== "") return c.json({ error: "content is required" }, 400)

  const path = c.req.param("path")
  const pathErr = db.validatePath(path)
  if (pathErr) return c.json({ error: `Invalid path: ${pathErr}` }, 400)

  const result = await db.replaceFile(c.env.DB, c.req.param("slug"), path, body.content)
  if (!result) return c.json({ error: "Folder not found" }, 404)
  return c.json(result, result.created ? 201 : 200)
})

app.patch("/~/public/:slug/:path{.+}", async (c) => {
  const authErr = await requireFolderAuth(c, c.req.param("slug"))
  if (authErr) return authErr

  const body = await c.req.json<{ updates: { old_str: string; new_str: string }[] }>()
  if (!body.updates?.length) return c.json({ error: "updates array is required" }, 400)

  const result = await db.patchFile(c.env.DB, c.req.param("slug"), c.req.param("path"), body.updates)
  if (!result) return c.json({ error: "Not found" }, 404)
  if (result.failed > 0) return c.json(result, 207)
  return c.json(result)
})

app.post("/~/public/:slug/:path{.+}", async (c) => {
  const slug = c.req.param("slug")
  const path = c.req.param("path")
  const comment = parseCommentPath(path)
  if (!comment) return c.json({ error: "Not found" }, 404)

  const ip = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || "unknown"

  if (comment.commentId && comment.isReplies) {
    // POST ~/public/:slug/:path/@comments/:id/replies
    const body = await c.req.json<{ body: string; author?: string }>()
    if (!body.body) return c.json({ error: "body is required" }, 400)
    const author = body.author || await anonName(ip)
    const reply = await db.addReply(c.env.DB, comment.commentId, body.body, author)

    // Fire webhook
    const webhookUrl = await db.getWebhookUrl(c.env.DB, slug)
    if (webhookUrl) {
      safeWaitUntil(c, fireWebhook(webhookUrl, {
        event: "reply.created",
        slug,
        file: comment.filePath,
        comment_id: comment.commentId,
        reply: { id: reply.id, body: body.body, author },
      }))
    }

    return c.json(reply, 201)
  }

  if (!comment.commentId) {
    // POST ~/public/:slug/:path/@comments
    const body = await c.req.json<{ anchor: object; body: string; author?: string }>()
    if (!body.anchor || !body.body) return c.json({ error: "anchor and body are required" }, 400)
    const file = await db.getFileBySlugAndPath(c.env.DB, slug, comment.filePath)
    if (!file) return c.json({ error: "File not found" }, 404)
    const author = body.author || await anonName(ip)
    const result = await db.addComment(c.env.DB, file.id as string, body.anchor, body.body, author)

    // Fire webhook
    const webhookUrl = await db.getWebhookUrl(c.env.DB, slug)
    if (webhookUrl) {
      safeWaitUntil(c, fireWebhook(webhookUrl, {
        event: "comment.created",
        slug,
        file: comment.filePath,
        comment: { id: result.id, anchor: body.anchor, body: body.body, author },
      }))
    }

    return c.json(result, 201)
  }

  return c.json({ error: "Not found" }, 404)
})

app.delete("/~/public/:slug/:path{.+}", async (c) => {
  const slug = c.req.param("slug")
  const authErr = await requireFolderAuth(c, slug)
  if (authErr) return authErr

  const path = c.req.param("path")
  const comment = parseCommentPath(path)

  if (comment?.commentId) {
    // DELETE ~/public/:slug/:path/@comments/:id
    await db.deleteComment(c.env.DB, comment.commentId)
    return c.json({ ok: true })
  }

  // DELETE file
  const result = await db.deleteFile(c.env.DB, slug, path)
  if (!result) return c.json({ error: "Not found" }, 404)
  return c.json(result)
})

// ─── SPA fallback ───────────────────────────────────────────

app.get("*", async (c) => {
  const url = new URL(c.req.url)
  const assetRes = await c.env.ASSETS.fetch(new Request(url.toString()))
  if (assetRes.status !== 404) return assetRes
  return c.env.ASSETS.fetch(new Request(new URL("/index.html", url.origin)))
})

export default app
