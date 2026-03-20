/**
 * Comment round-trip tests — the chain that must never break:
 *   create comment → fetch → verify persisted
 *   reply to comment → fetch → verify reply exists
 *   delete comment → fetch → verify gone
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestEnv, teardownTestEnv, request } from "./setup"

beforeAll(async () => { await setupTestEnv() })
afterAll(async () => { await teardownTestEnv() })

async function createTestFolder() {
  const res = await request("/~/public", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Test",
      files: [{ path: "readme.md", content: "# Hello\n\nSome **bold** text here." }],
    }),
  })
  return res.json() as Promise<{ slug: string }>
}

async function getFolder(slug: string) {
  const res = await request(`/~/public/${slug}`, {
    headers: { Accept: "application/json" },
  })
  return res.json() as Promise<any>
}

const anchor = { exact: "bold", prefix: "Some **", suffix: "** text here.", hint: 18 }

describe("comment lifecycle", () => {
  it("create → fetch → persisted", async () => {
    const { slug } = await createTestFolder()

    const createRes = await request(`/~/public/${slug}/readme.md/@comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anchor, body: "Great point!", author: "Alice" }),
    })
    expect(createRes.status).toBe(201)
    const created = await createRes.json() as { id: string }
    expect(created.id).toBeTruthy()

    // "Refresh" — fetch from server
    const folder = await getFolder(slug)
    const file = folder.files.find((f: any) => f.path === "readme.md")
    expect(file.comments).toHaveLength(1)
    expect(file.comments[0].id).toBe(created.id)
    expect(file.comments[0].body).toBe("Great point!")
    expect(file.comments[0].author).toBe("Alice")
    expect(file.comments[0].anchor.exact).toBe("bold")
  })

  it("rejects empty body with 400", async () => {
    const { slug } = await createTestFolder()

    const res = await request(`/~/public/${slug}/readme.md/@comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anchor, body: "" }),
    })
    expect(res.status).toBe(400)
  })

  it("reply → fetch → reply persisted", async () => {
    const { slug } = await createTestFolder()

    // Create comment
    const createRes = await request(`/~/public/${slug}/readme.md/@comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anchor, body: "Nice!", author: "Alice" }),
    })
    const { id: commentId } = await createRes.json() as { id: string }

    // Reply
    const replyRes = await request(`/~/public/${slug}/readme.md/@comments/${commentId}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Thanks!", author: "Bob" }),
    })
    expect(replyRes.status).toBe(201)
    const reply = await replyRes.json() as { id: string }

    // "Refresh"
    const folder = await getFolder(slug)
    const file = folder.files.find((f: any) => f.path === "readme.md")
    expect(file.comments[0].replies).toHaveLength(1)
    expect(file.comments[0].replies[0].id).toBe(reply.id)
    expect(file.comments[0].replies[0].body).toBe("Thanks!")
  })

  it("delete → fetch → gone", async () => {
    const { slug } = await createTestFolder()

    const createRes = await request(`/~/public/${slug}/readme.md/@comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anchor, body: "Will be deleted", author: "Alice" }),
    })
    const { id: commentId } = await createRes.json() as { id: string }

    // Delete
    const deleteRes = await request(`/~/public/${slug}/readme.md/@comments/${commentId}`, {
      method: "DELETE",
    })
    expect(deleteRes.status).toBe(200)

    // "Refresh"
    const folder = await getFolder(slug)
    const file = folder.files.find((f: any) => f.path === "readme.md")
    expect(file.comments).toHaveLength(0)
  })

  it("delete cascades replies", async () => {
    const { slug } = await createTestFolder()

    const createRes = await request(`/~/public/${slug}/readme.md/@comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anchor, body: "Parent", author: "Alice" }),
    })
    const { id: commentId } = await createRes.json() as { id: string }

    await request(`/~/public/${slug}/readme.md/@comments/${commentId}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Reply", author: "Bob" }),
    })

    await request(`/~/public/${slug}/readme.md/@comments/${commentId}`, { method: "DELETE" })

    const folder = await getFolder(slug)
    const file = folder.files.find((f: any) => f.path === "readme.md")
    expect(file.comments).toHaveLength(0)
  })

  it("full chain: create → reply × 2 → survives re-fetch", async () => {
    const { slug } = await createTestFolder()

    const c1 = await request(`/~/public/${slug}/readme.md/@comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anchor, body: "First comment", author: "Alice" }),
    })
    const { id: commentId } = await c1.json() as { id: string }

    await request(`/~/public/${slug}/readme.md/@comments/${commentId}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Reply 1", author: "Bob" }),
    })
    await request(`/~/public/${slug}/readme.md/@comments/${commentId}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Reply 2", author: "Charlie" }),
    })

    // "Refresh"
    const folder = await getFolder(slug)
    const file = folder.files.find((f: any) => f.path === "readme.md")
    expect(file.comments).toHaveLength(1)
    expect(file.comments[0].id).toBe(commentId)
    expect(file.comments[0].body).toBe("First comment")
    expect(file.comments[0].replies).toHaveLength(2)
    const replyBodies = file.comments[0].replies.map((r: any) => r.body).sort()
    expect(replyBodies).toEqual(["Reply 1", "Reply 2"])
  })
})
