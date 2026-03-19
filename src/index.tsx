import { Hono } from "hono"
import { uniqueSlug, anonName } from "./slug"
import * as db from "./db"

type Bindings = { DB: D1Database; ASSETS: Fetcher }

const app = new Hono<{ Bindings: Bindings }>()

// ─── API Routes ─────────────────────────────────────────────

app.get("/api/tasks/:slug", async (c) => {
  const task = await db.getTask(c.env.DB, c.req.param("slug"))
  if (!task) return c.json({ error: "Not found" }, 404)
  return c.json(task)
})

app.post("/api/tasks", async (c) => {
  const body = await c.req.json<{
    title?: string
    files: { path: string; content: string }[]
  }>()

  if (!body.files?.length) return c.json({ error: "At least one file required" }, 400)

  // Validate all paths
  for (const f of body.files) {
    const err = db.validatePath(f.path)
    if (err) return c.json({ error: `Invalid path "${f.path}": ${err}` }, 400)
  }

  const slug = await uniqueSlug(c.env.DB)
  const task = await db.createTask(c.env.DB, slug, body.title || "Untitled", body.files)
  return c.json(task, 201)
})

app.get("/api/comments/:id", async (c) => {
  const comment = await db.getComment(c.env.DB, c.req.param("id"))
  if (!comment) return c.json({ error: "Not found" }, 404)
  return c.json(comment)
})

app.get("/api/files/:fileId/comments", async (c) => {
  const comments = await db.listComments(c.env.DB, c.req.param("fileId"))
  return c.json(comments)
})

app.post("/api/comments", async (c) => {
  const body = await c.req.json<{
    fileId: string
    anchor: object
    body: string
    author?: string
  }>()

  if (!body.fileId || !body.anchor || !body.body) {
    return c.json({ error: "fileId, anchor, and body are required" }, 400)
  }

  const author = body.author || await anonName(c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || "unknown")
  const comment = await db.addComment(c.env.DB, body.fileId, body.anchor, body.body, author)
  return c.json(comment, 201)
})

app.delete("/api/comments/:id", async (c) => {
  await db.deleteComment(c.env.DB, c.req.param("id"))
  return c.json({ ok: true })
})

app.post("/api/replies", async (c) => {
  const body = await c.req.json<{
    commentId: string
    body: string
    author?: string
  }>()

  if (!body.commentId || !body.body) {
    return c.json({ error: "commentId and body are required" }, 400)
  }

  const author = body.author || await anonName(c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || "unknown")
  const reply = await db.addReply(c.env.DB, body.commentId, body.body, author)
  return c.json(reply, 201)
})

// ─── File operations ────────────────────────────────────────

app.get("/api/tasks/:slug/files/:path{.+}", async (c) => {
  const file = await db.getFileBySlugAndPath(c.env.DB, c.req.param("slug"), c.req.param("path"))
  if (!file) return c.json({ error: "Not found" }, 404)
  return c.json(file)
})

app.put("/api/tasks/:slug/files/:path{.+}", async (c) => {
  const body = await c.req.json<{ content: string }>()
  if (!body.content && body.content !== "") return c.json({ error: "content is required" }, 400)

  const path = c.req.param("path")
  const pathErr = db.validatePath(path)
  if (pathErr) return c.json({ error: `Invalid path: ${pathErr}` }, 400)

  const result = await db.replaceFile(c.env.DB, c.req.param("slug"), path, body.content)
  if (!result) return c.json({ error: "Task not found" }, 404)
  return c.json(result, result.created ? 201 : 200)
})

app.patch("/api/tasks/:slug/files/:path{.+}", async (c) => {
  const body = await c.req.json<{ updates: { old_str: string; new_str: string }[] }>()
  if (!body.updates?.length) return c.json({ error: "updates array is required" }, 400)

  const result = await db.patchFile(c.env.DB, c.req.param("slug"), c.req.param("path"), body.updates)
  if (!result) return c.json({ error: "Not found" }, 404)
  if (result.failed > 0) return c.json(result, 207)
  return c.json(result)
})

app.delete("/api/tasks/:slug/files/:path{.+}", async (c) => {
  const result = await db.deleteFile(c.env.DB, c.req.param("slug"), c.req.param("path"))
  if (!result) return c.json({ error: "Not found" }, 404)
  return c.json(result)
})

// ─── SPA fallback — serve index.html for non-API routes ─────

app.get("*", async (c) => {
  const url = new URL(c.req.url)
  const assetRes = await c.env.ASSETS.fetch(new Request(url.toString()))
  if (assetRes.status !== 404) return assetRes
  return c.env.ASSETS.fetch(new Request(new URL("/index.html", url.origin)))
})

export default app
