/**
 * chmod-style permission tests.
 * Covers: mode validation, comment gating, token holder bypass, GET response.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestEnv, teardownTestEnv, request, TEST_ADMIN_TOKEN } from "./setup"
import { parseMode, hasPerm, validateMode, PERM_READ, PERM_COMMENT, PERM_WRITE } from "../db"

beforeAll(async () => { await setupTestEnv() })
afterAll(async () => { await teardownTestEnv() })

// ─── Pure function tests ────────────────────────────────────

describe("parseMode", () => {
  it("parses '76' into [7, 6]", () => {
    expect(parseMode("76")).toEqual([7, 6])
  })
  it("parses '74' into [7, 4]", () => {
    expect(parseMode("74")).toEqual([7, 4])
  })
  it("parses '70' into [7, 0]", () => {
    expect(parseMode("70")).toEqual([7, 0])
  })
  it("parses '40' into [4, 0]", () => {
    expect(parseMode("40")).toEqual([4, 0])
  })
})

describe("hasPerm", () => {
  it("7 has read, comment, write", () => {
    expect(hasPerm(7, PERM_READ)).toBe(true)
    expect(hasPerm(7, PERM_COMMENT)).toBe(true)
    expect(hasPerm(7, PERM_WRITE)).toBe(true)
  })
  it("6 has read and comment, no write", () => {
    expect(hasPerm(6, PERM_READ)).toBe(true)
    expect(hasPerm(6, PERM_COMMENT)).toBe(true)
    expect(hasPerm(6, PERM_WRITE)).toBe(false)
  })
  it("4 has read only", () => {
    expect(hasPerm(4, PERM_READ)).toBe(true)
    expect(hasPerm(4, PERM_COMMENT)).toBe(false)
    expect(hasPerm(4, PERM_WRITE)).toBe(false)
  })
  it("0 has nothing", () => {
    expect(hasPerm(0, PERM_READ)).toBe(false)
    expect(hasPerm(0, PERM_COMMENT)).toBe(false)
    expect(hasPerm(0, PERM_WRITE)).toBe(false)
  })
})

describe("validateMode", () => {
  it("accepts '76' (default)", () => {
    expect(validateMode("76")).toBeNull()
  })
  it("accepts '74' (locked comments)", () => {
    expect(validateMode("74")).toBeNull()
  })
  it("accepts '70' (private)", () => {
    expect(validateMode("70")).toBeNull()
  })
  it("accepts '40' (owner read-only archive)", () => {
    expect(validateMode("40")).toBeNull()
  })
  it("rejects '99' (not octal)", () => {
    expect(validateMode("99")).toBeTruthy()
  })
  it("rejects '7' (single digit)", () => {
    expect(validateMode("7")).toBeTruthy()
  })
  it("rejects '761' (three digits)", () => {
    expect(validateMode("761")).toBeTruthy()
  })
  it("rejects '72' (comment without read)", () => {
    expect(validateMode("72")).toBeTruthy()
  })
  it("rejects '71' (public write)", () => {
    expect(validateMode("71")).toBeTruthy()
  })
  it("rejects '73' (public write+comment)", () => {
    expect(validateMode("73")).toBeTruthy()
  })
})

// ─── API round-trip tests ───────────────────────────────────

async function createFolder(opts: { mode?: string } = {}) {
  const res = await request("/~/public", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Perm Test",
      mode: opts.mode,
      files: [{ path: "readme.md", content: "# Hello\n\nSome text here." }],
    }),
  })
  return { status: res.status, data: await res.json() as any }
}

async function postComment(slug: string, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers["Authorization"] = `Bearer ${token}`
  return request(`/~/public/${slug}/readme.md/@comments`, {
    method: "POST",
    headers,
    body: JSON.stringify({ anchor: { exact: "Hello" }, body: "test comment" }),
  })
}

async function postReply(slug: string, commentId: string, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers["Authorization"] = `Bearer ${token}`
  return request(`/~/public/${slug}/readme.md/@comments/${commentId}/replies`, {
    method: "POST",
    headers,
    body: JSON.stringify({ body: "test reply" }),
  })
}

describe("folder creation with mode", () => {
  it("accepts valid mode '74'", async () => {
    const { status } = await createFolder({ mode: "74" })
    expect(status).toBeLessThan(300)
  })

  it("defaults to '76' when mode omitted", async () => {
    const { data } = await createFolder()
    const res = await request(`/~/public/${data.slug}`, {
      headers: { Accept: "application/json" },
    })
    const folder = await res.json() as any
    expect(folder.mode).toBe("76")
  })

  it("rejects invalid mode '99'", async () => {
    const res = await request("/~/public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Bad", mode: "99",
        files: [{ path: "x.md", content: "x" }],
      }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects public write mode '71'", async () => {
    const res = await request("/~/public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Bad", mode: "71",
        files: [{ path: "x.md", content: "x" }],
      }),
    })
    expect(res.status).toBe(400)
  })
})

describe("comment gating with mode '74' (locked)", () => {
  let slug: string
  let token: string

  beforeAll(async () => {
    const { data } = await createFolder({ mode: "74" })
    slug = data.slug
    token = data.token
  })

  it("rejects public comment with 403", async () => {
    const res = await postComment(slug)
    expect(res.status).toBe(403)
    const body = await res.json() as any
    expect(body.error).toMatch(/disabled/i)
  })

  it("allows token holder to comment", async () => {
    const res = await postComment(slug, token)
    expect(res.status).toBe(201)
  })

  it("allows admin to comment", async () => {
    const res = await postComment(slug, TEST_ADMIN_TOKEN)
    expect(res.status).toBe(201)
  })

  it("rejects public reply with 403", async () => {
    // First create a comment as owner
    const commentRes = await postComment(slug, token)
    const { id } = await commentRes.json() as any
    // Try to reply as public
    const res = await postReply(slug, id)
    expect(res.status).toBe(403)
  })

  it("allows token holder to reply", async () => {
    const commentRes = await postComment(slug, token)
    const { id } = await commentRes.json() as any
    const res = await postReply(slug, id, token)
    expect(res.status).toBe(201)
  })
})

describe("comment gating with mode '76' (default)", () => {
  let slug: string

  beforeAll(async () => {
    const { data } = await createFolder({ mode: "76" })
    slug = data.slug
  }, 15000)

  it("allows public comment", async () => {
    const res = await postComment(slug)
    expect(res.status).toBe(201)
  })

  it("allows public reply", async () => {
    const commentRes = await postComment(slug)
    const { id } = await commentRes.json() as any
    const res = await postReply(slug, id)
    expect(res.status).toBe(201)
  })
})

describe("mode in GET response", () => {
  it("returns mode in folder JSON", async () => {
    const { data } = await createFolder({ mode: "74" })
    const res = await request(`/~/public/${data.slug}`, {
      headers: { Accept: "application/json" },
    })
    const folder = await res.json() as any
    expect(folder.mode).toBe("74")
  })
})
