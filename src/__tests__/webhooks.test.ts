/**
 * Webhook notification tests.
 *   create folder with webhook_url → comment → webhook fires with correct payload
 *   create folder without webhook_url → hook.new auto-creates hook
 *   reply → webhook fires with reply payload
 *   no webhook_url → comment → no error
 */
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest"
import { setupTestEnv, teardownTestEnv, request } from "./setup"

beforeAll(async () => { await setupTestEnv() })
afterAll(async () => { await teardownTestEnv() })

// Capture outbound fetches (webhook fires + hook.new calls)
const fetchCalls: { url: string; body: any }[] = []
const originalFetch = globalThis.fetch

beforeEach(() => {
  fetchCalls.length = 0
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url
    // Intercept hook.new API calls
    if (url.startsWith("https://hook.new/hooks")) {
      const body = init?.body ? JSON.parse(init.body) : {}
      fetchCalls.push({ url, body })
      return new Response(JSON.stringify({
        hook_id: "hk_test123",
        ingest_url: "https://hook.new/i/hk_test123",
        manage_url: "https://hook.new/h/hk_test123",
        manage_token: "mg_testtoken",
      }), { status: 201, headers: { "Content-Type": "application/json" } })
    }
    // Intercept webhook fires
    if (url.includes("://")) {
      const body = init?.body ? JSON.parse(init.body) : {}
      fetchCalls.push({ url, body })
      return new Response("ok", { status: 200 })
    }
    return originalFetch(input, init)
  }) as any
})

afterAll(() => {
  globalThis.fetch = originalFetch
})

async function createFolderWithWebhook(webhookUrl?: string) {
  const body: any = {
    title: "Webhook Test",
    files: [{ path: "readme.md", content: "# Hello\n\nSome text here." }],
  }
  if (webhookUrl) body.webhook_url = webhookUrl
  const res = await request("/~/public", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return res.json() as Promise<any>
}

const anchor = { exact: "Some text", prefix: "# Hello\n\n", suffix: " here." }

describe("webhook_url validation", () => {
  it("rejects non-HTTPS webhook_url", async () => {
    const res = await request("/~/public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Test",
        webhook_url: "http://evil.com/steal",
        files: [{ path: "a.md", content: "x" }],
      }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as any
    expect(body.error).toContain("HTTPS")
  })

  it("rejects file:// scheme", async () => {
    const res = await request("/~/public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Test",
        webhook_url: "file:///etc/passwd",
        files: [{ path: "a.md", content: "x" }],
      }),
    })
    expect(res.status).toBe(400)
  })

  it("allows http://localhost for dev", async () => {
    const res = await request("/~/public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Test",
        webhook_url: "http://localhost:9998/hook",
        files: [{ path: "a.md", content: "x" }],
      }),
    })
    expect(res.status).toBe(201)
  })

  it("allows HTTPS URLs", async () => {
    const res = await request("/~/public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Test",
        webhook_url: "https://my-agent.com/webhook",
        files: [{ path: "a.md", content: "x" }],
      }),
    })
    expect(res.status).toBe(201)
  })
})

describe("webhook on folder creation", () => {
  it("auto-creates hook.new hook when no webhook_url provided", async () => {
    const result = await createFolderWithWebhook()
    expect(result.hook).toBeTruthy()
    expect(result.hook.hook_id).toBe("hk_test123")
    expect(result.hook.ingest_url).toBe("https://hook.new/i/hk_test123")
    expect(result.hook.manage_url).toBe("https://hook.new/h/hk_test123")
    expect(result.hook.manage_token).toBe("mg_testtoken")

    // Should have called hook.new
    const hookCall = fetchCalls.find(c => c.url.includes("hook.new/hooks"))
    expect(hookCall).toBeTruthy()
  })

  it("skips hook.new when webhook_url is provided", async () => {
    fetchCalls.length = 0
    const result = await createFolderWithWebhook("https://my-agent.com/webhook")
    expect(result.hook).toBeUndefined()

    // Should NOT have called hook.new
    const hookCall = fetchCalls.find(c => c.url.includes("hook.new/hooks"))
    expect(hookCall).toBeUndefined()
  })
})

describe("webhook fires on comment", () => {
  it("fires comment.created with correct payload", async () => {
    const { slug } = await createFolderWithWebhook("https://test-agent.com/hook")
    fetchCalls.length = 0

    const commentRes = await request(`/~/public/${slug}/readme.md/@comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anchor, body: "Great work!", author: "Alice" }),
    })
    expect(commentRes.status).toBe(201)
    const { id: commentId } = await commentRes.json() as { id: string }

    // waitUntil fires async — give it a tick
    await new Promise(r => setTimeout(r, 50))

    const webhookCall = fetchCalls.find(c => c.url === "https://test-agent.com/hook")
    expect(webhookCall).toBeTruthy()
    expect(webhookCall!.body.event).toBe("comment.created")
    expect(webhookCall!.body.slug).toBe(slug)
    expect(webhookCall!.body.file).toBe("readme.md")
    expect(webhookCall!.body.comment.id).toBe(commentId)
    expect(webhookCall!.body.comment.body).toBe("Great work!")
    expect(webhookCall!.body.comment.author).toBe("Alice")
    expect(webhookCall!.body.comment.anchor).toEqual(anchor)
  })

  it("fires reply.created with correct payload", async () => {
    const { slug } = await createFolderWithWebhook("https://test-agent.com/hook")

    const commentRes = await request(`/~/public/${slug}/readme.md/@comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anchor, body: "Comment", author: "Alice" }),
    })
    const { id: commentId } = await commentRes.json() as { id: string }
    fetchCalls.length = 0

    const replyRes = await request(`/~/public/${slug}/readme.md/@comments/${commentId}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Thanks!", author: "Bob" }),
    })
    expect(replyRes.status).toBe(201)
    const { id: replyId } = await replyRes.json() as { id: string }

    await new Promise(r => setTimeout(r, 50))

    const webhookCall = fetchCalls.find(c => c.url === "https://test-agent.com/hook")
    expect(webhookCall).toBeTruthy()
    expect(webhookCall!.body.event).toBe("reply.created")
    expect(webhookCall!.body.slug).toBe(slug)
    expect(webhookCall!.body.file).toBe("readme.md")
    expect(webhookCall!.body.comment_id).toBe(commentId)
    expect(webhookCall!.body.reply.id).toBe(replyId)
    expect(webhookCall!.body.reply.body).toBe("Thanks!")
    expect(webhookCall!.body.reply.author).toBe("Bob")
  })

  it("no error when folder has no webhook_url", async () => {
    // Create folder with custom webhook_url, then simulate one without
    // by directly creating via DB (or just use a folder where hook.new mock returns null)
    const savedFetch = globalThis.fetch
    globalThis.fetch = (() => {
      throw new Error("should not fetch")
    }) as any

    // Create folder — this will try hook.new which will fail, so no webhook_url stored
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url
      if (url.startsWith("https://hook.new")) {
        return new Response("error", { status: 500 })
      }
      return originalFetch(input, init)
    }) as any

    const createRes = await request("/~/public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "No Webhook",
        files: [{ path: "readme.md", content: "# No webhook" }],
      }),
    })
    const { slug } = await createRes.json() as any

    // Reset fetch to track calls
    globalThis.fetch = savedFetch
    fetchCalls.length = 0

    // Comment should succeed without error even with no webhook
    const commentRes = await request(`/~/public/${slug}/readme.md/@comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anchor: { exact: "No webhook" }, body: "Test", author: "Alice" }),
    })
    expect(commentRes.status).toBe(201)
  })
})
