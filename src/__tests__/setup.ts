/**
 * Shared test setup: creates a Miniflare instance with D1,
 * applies migrations, and provides a helper to make requests
 * against the Hono app with real D1 bindings.
 */
import { Miniflare } from "miniflare"
import app from "../index"

let mf: Miniflare
let db: D1Database

const TABLES = [
  `CREATE TABLE IF NOT EXISTS folders (id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT, description TEXT, command TEXT, webhook_url TEXT, token_hash TEXT, mode TEXT NOT NULL DEFAULT '76' CHECK (mode GLOB '[0-7][0-7]'), created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, folder_id TEXT NOT NULL REFERENCES folders(id), path TEXT NOT NULL, content TEXT NOT NULL, language TEXT, sort_order INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, file_id TEXT NOT NULL REFERENCES files(id), anchor_json TEXT NOT NULL, body TEXT NOT NULL, author TEXT DEFAULT 'Anonymous', created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS replies (id TEXT PRIMARY KEY, comment_id TEXT NOT NULL REFERENCES comments(id), body TEXT NOT NULL, author TEXT DEFAULT 'Anonymous', created_at TEXT DEFAULT (datetime('now')))`,
]

export const TEST_ADMIN_TOKEN = "test-admin-token"

export async function setupTestEnv() {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('') } }",
    d1Databases: { DB: "test-db" },
  })
  db = await mf.getD1Database("DB")
  for (const sql of TABLES) await db.exec(sql)
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
