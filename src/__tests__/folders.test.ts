/**
 * Folder & file CRUD round-trip tests.
 *   create folder → fetch → verify
 *   put file → fetch → verify
 *   patch file → fetch → verify
 *   delete file → fetch → gone
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestEnv, teardownTestEnv, request } from "./setup"

beforeAll(async () => { await setupTestEnv() })
afterAll(async () => { await teardownTestEnv() })

async function getFolder(slug: string) {
  const res = await request(`/~/public/${slug}`, {
    headers: { Accept: "application/json" },
  })
  return res.json() as Promise<any>
}

describe("folder lifecycle", () => {
  it("create → fetch → correct structure", async () => {
    const createRes = await request("/~/public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "My Folder",
        files: [
          { path: "readme.md", content: "# Hello" },
          { path: "src/index.ts", content: "export default 42" },
        ],
      }),
    })
    expect(createRes.status).toBe(201)
    const { slug } = await createRes.json() as { slug: string }

    const folder = await getFolder(slug)
    expect(folder.title).toBe("My Folder")
    expect(folder.files).toHaveLength(2)
    expect(folder.files[0].path).toBe("readme.md")
    expect(folder.files[0].content).toBe("# Hello")
    expect(folder.files[1].path).toBe("src/index.ts")
    expect(folder.files[1].content).toBe("export default 42")
  })

  it("nonexistent folder returns 404", async () => {
    const res = await request("/~/public/does-not-exist-999", {
      headers: { Accept: "application/json" },
    })
    expect(res.status).toBe(404)
  })
})

describe("file operations", () => {
  it("PUT creates new file", async () => {
    const createRes = await request("/~/public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test", files: [{ path: "a.md", content: "original" }] }),
    })
    const { slug } = await createRes.json() as { slug: string }

    const putRes = await request(`/~/public/${slug}/new-file.ts`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "const x = 1" }),
    })
    expect(putRes.status).toBe(201)

    const folder = await getFolder(slug)
    expect(folder.files).toHaveLength(2)
    const newFile = folder.files.find((f: any) => f.path === "new-file.ts")
    expect(newFile.content).toBe("const x = 1")
  })

  it("PUT updates existing file", async () => {
    const createRes = await request("/~/public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test", files: [{ path: "a.md", content: "original" }] }),
    })
    const { slug } = await createRes.json() as { slug: string }

    const putRes = await request(`/~/public/${slug}/a.md`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "updated" }),
    })
    expect(putRes.status).toBe(200)

    const folder = await getFolder(slug)
    expect(folder.files[0].content).toBe("updated")
  })

  it("PATCH applies text replacements", async () => {
    const createRes = await request("/~/public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test", files: [{ path: "a.md", content: "hello world" }] }),
    })
    const { slug } = await createRes.json() as { slug: string }

    const patchRes = await request(`/~/public/${slug}/a.md`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates: [{ old_str: "hello", new_str: "goodbye" }] }),
    })
    expect(patchRes.status).toBe(200)
    const result = await patchRes.json() as any
    expect(result.applied).toBe(1)

    const folder = await getFolder(slug)
    expect(folder.files[0].content).toBe("goodbye world")
  })

  it("DELETE removes file", async () => {
    const createRes = await request("/~/public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Test",
        files: [
          { path: "keep.md", content: "keep" },
          { path: "remove.md", content: "remove" },
        ],
      }),
    })
    const { slug } = await createRes.json() as { slug: string }

    const deleteRes = await request(`/~/public/${slug}/remove.md`, { method: "DELETE" })
    expect(deleteRes.status).toBe(200)

    const folder = await getFolder(slug)
    expect(folder.files).toHaveLength(1)
    expect(folder.files[0].path).toBe("keep.md")
  })
})
