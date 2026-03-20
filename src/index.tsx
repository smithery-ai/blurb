import { Hono } from "hono"
import { uniqueSlug, anonName } from "./slug"
import * as db from "./db"
import { hashStr, renderFernSVG } from "../lib/fern-core"


type Bindings = { DB: D1Database; ASSETS: Fetcher; ADMIN_TOKEN?: string }
type HonoEnv = { Bindings: Bindings }

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
    <meta property="og:image" content="${url.origin}/~/public/${data.slug}/og.svg" />
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

// ─── Home redirect ───────────────────────────────────────────

app.get("/", (c) => c.redirect("/~/public/blurb"))

// ─── Folder routes ──────────────────────────────────────────

app.post("/~/public", async (c) => {
  const body = await c.req.json<{
    title?: string
    description?: string
    command?: string
    files: { path: string; content: string }[]
  }>()

  if (!body.files?.length) return c.json({ error: "At least one file required" }, 400)

  const landingErr = db.validateLanding(body.description, body.command)
  if (landingErr) return c.json({ error: landingErr }, 400)

  for (const f of body.files) {
    const err = db.validatePath(f.path)
    if (err) return c.json({ error: `Invalid path "${f.path}": ${err}` }, 400)
  }

  const slug = await uniqueSlug(c.env.DB)
  const folder = await db.createFolder(c.env.DB, slug, body.title || "Untitled", body.files, {
    description: body.description,
    command: body.command,
  })
  return c.json(folder, 201)
})

// Create/replace folder with a specific slug
app.put("/~/public/:slug", async (c) => {
  const slug = c.req.param("slug")
  const body = await c.req.json<{
    title?: string
    description?: string
    command?: string
    files: { path: string; content: string }[]
  }>()

  if (!body.files?.length) return c.json({ error: "At least one file required" }, 400)

  const landingErr = db.validateLanding(body.description, body.command)
  if (landingErr) return c.json({ error: landingErr }, 400)

  for (const f of body.files) {
    const err = db.validatePath(f.path)
    if (err) return c.json({ error: `Invalid path "${f.path}": ${err}` }, 400)
  }

  // Delete existing folder if present, then recreate with same slug
  const existing = await db.getFolder(c.env.DB, slug)
  if (existing) {
    // Must delete in order: replies → comments → files → folder (no CASCADE)
    await c.env.DB.prepare(`
      DELETE FROM replies WHERE comment_id IN (
        SELECT c.id FROM comments c JOIN files f ON c.file_id = f.id WHERE f.folder_id = ?
      )`).bind(existing.id).run()
    await c.env.DB.prepare(`
      DELETE FROM comments WHERE file_id IN (
        SELECT id FROM files WHERE folder_id = ?
      )`).bind(existing.id).run()
    await c.env.DB.prepare("DELETE FROM files WHERE folder_id = ?").bind(existing.id).run()
    await c.env.DB.prepare("DELETE FROM folders WHERE id = ?").bind(existing.id).run()
  }

  const folder = await db.createFolder(c.env.DB, slug, body.title || "Untitled", body.files, {
    description: body.description,
    command: body.command,
  })
  return c.json(folder, existing ? 200 : 201)
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
    return c.json(result, 201)
  }

  return c.json({ error: "Not found" }, 404)
})

app.delete("/~/public/:slug/:path{.+}", async (c) => {
  const slug = c.req.param("slug")
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
