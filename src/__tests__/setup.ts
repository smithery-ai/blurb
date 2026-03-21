/**
 * Shared test setup: creates a Miniflare instance with D1,
 * applies migrations from the migrations/ directory automatically,
 * and provides a helper to make requests against the Hono app.
 */
import { Miniflare } from "miniflare"
import { readdir, readFile } from "fs/promises"
import { join } from "path"
import app from "../index"

let mf: Miniflare
let db: D1Database

export const TEST_ADMIN_TOKEN = "test-admin-token"

export async function setupTestEnv() {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('') } }",
    d1Databases: { DB: "test-db" },
  })
  db = await mf.getD1Database("DB")

  // Auto-apply all migration files in order
  const migrationsDir = join(__dirname, "../../migrations")
  const files = await readdir(migrationsDir)
  const sqlFiles = files.filter(f => f.endsWith(".sql")).sort()
  for (const file of sqlFiles) {
    const raw = await readFile(join(migrationsDir, file), "utf-8")
    // Strip comments, collapse whitespace, split on semicolons outside parens
    const clean = raw.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim()
    // Split carefully: only on semicolons that are followed by a space + keyword or end
    const stmts = clean.split(/;\s*(?=(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|$))/i)
      .map(s => s.trim()).filter(Boolean)
    for (const stmt of stmts) {
      await db.prepare(stmt).run()
    }
  }

  return { db, mf }
}

export async function teardownTestEnv() {
  await mf?.dispose()
}

/** Make a request against the Hono app with real D1 */
export function request(path: string, init?: RequestInit) {
  const req = new Request(`https://test.local${path}`, init)
  const mockRooms = {
    idFromName: () => ({ toString: () => "test" }),
    get: () => ({ fetch: () => Promise.resolve(new Response("ok")) }),
  }
  return app.fetch(req, { DB: db, ADMIN_TOKEN: TEST_ADMIN_TOKEN, ROOMS: mockRooms as any, ASSETS: { fetch: () => new Response("<!DOCTYPE html><html><head></head><body></body></html>") } as any })
}
