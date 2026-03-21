type DB = D1Database

function id(): string {
  return crypto.randomUUID()
}

// ─── Permission mode (chmod-style) ──────────────────────────

export const PERM_READ    = 4
export const PERM_COMMENT = 2
export const PERM_WRITE   = 1

/** Check if a mode digit includes a permission bit */
export function hasPerm(digit: number, bit: number): boolean {
  return (digit & bit) !== 0
}

/** Parse mode string into [owner, public] digits */
export function parseMode(mode: string): [number, number] {
  return [parseInt(mode[0], 8), parseInt(mode[1], 8)]
}

/** Validate a mode string — must be two octal digits */
export function validateMode(mode: string): string | null {
  if (!/^[0-7]{2}$/.test(mode)) return "mode must be two octal digits (e.g. '76')"
  const [, o] = parseMode(mode)
  if (hasPerm(o, PERM_COMMENT) && !hasPerm(o, PERM_READ)) return "public cannot comment without read"
  if (hasPerm(o, PERM_WRITE)) return "public write is not supported"
  return null
}

// ─── Path validation ────────────────────────────────────────

const PATH_RE = /^[a-zA-Z0-9_\-\.\/]+$/

export function validatePath(path: string): string | null {
  if (!path) return "path is required"
  const ext = path.split(".").pop()?.toLowerCase()
  const allowed = [
    "md", "mdx", "json",
    "ts", "tsx", "js", "jsx", "mjs", "cjs",
    "py", "rs", "go", "java", "kt", "swift", "c", "cpp", "h", "hpp",
    "css", "scss", "html", "svg",
    "yaml", "yml", "toml", "xml",
    "sh", "bash", "zsh",
    "sql", "graphql",
    "dockerfile",
  ]
  if (!ext || !allowed.includes(ext)) return `path must end in .${allowed.join(", .")}`
  if (path.startsWith("/")) return "path must not start with /"
  if (path.includes("//")) return "path must not contain //"
  if (path.includes("..")) return "path must not contain .."
  if (!PATH_RE.test(path)) return "path contains invalid characters"
  return null
}

// ─── Folders ─────────────────────────────────────────────────

export async function getFolder(db: DB, slug: string) {
  // Single query: JOIN folders → files → comments → replies
  const rows = await db.prepare(`
    SELECT
      fo.id as folder_id, fo.slug, fo.title, fo.description as folder_description, fo.command as folder_command, fo.mode as folder_mode, fo.created_at as folder_created_at,
      f.id as file_id, f.path, f.content, f.language, f.sort_order,
      c.id as comment_id, c.anchor_json, c.body as comment_body, c.author as comment_author, c.created_at as comment_created_at,
      r.id as reply_id, r.body as reply_body, r.author as reply_author, r.created_at as reply_created_at
    FROM folders fo
    LEFT JOIN files f ON f.folder_id = fo.id
    LEFT JOIN comments c ON c.file_id = f.id
    LEFT JOIN replies r ON r.comment_id = c.id
    WHERE fo.slug = ?
    ORDER BY f.sort_order, f.path, c.created_at, r.created_at
  `).bind(slug).all()

  if (rows.results.length === 0) return null
  const first = rows.results[0] as any

  // Denormalize the flat JOIN rows into nested structure
  const filesMap = new Map<string, any>()
  const commentsMap = new Map<string, any>()

  for (const row of rows.results as any[]) {
    if (!row.file_id) continue

    if (!filesMap.has(row.file_id)) {
      filesMap.set(row.file_id, {
        id: row.file_id,
        path: row.path,
        content: row.content,
        language: row.language,
        comments: [],
        _commentIds: new Set(),
      })
    }

    if (row.comment_id) {
      const file = filesMap.get(row.file_id)!
      if (!file._commentIds.has(row.comment_id)) {
        file._commentIds.add(row.comment_id)
        const comment = {
          id: row.comment_id,
          anchor: JSON.parse(row.anchor_json),
          body: row.comment_body,
          author: row.comment_author,
          createdAt: row.comment_created_at,
          replies: [] as any[],
          _replyIds: new Set<string>(),
        }
        commentsMap.set(row.comment_id, comment)
        file.comments.push(comment)
      }

      if (row.reply_id) {
        const comment = commentsMap.get(row.comment_id)!
        if (!comment._replyIds.has(row.reply_id)) {
          comment._replyIds.add(row.reply_id)
          comment.replies.push({
            id: row.reply_id,
            body: row.reply_body,
            author: row.reply_author,
            createdAt: row.reply_created_at,
          })
        }
      }
    }
  }

  // Clean up internal tracking fields
  const enrichedFiles = [...filesMap.values()].map(({ _commentIds, ...f }) => ({
    ...f,
    comments: f.comments.map(({ _replyIds, ...c }: any) => c),
  }))

  return {
    id: first.folder_id,
    slug: first.slug,
    title: first.title,
    description: first.folder_description || undefined,
    command: first.folder_command || undefined,
    mode: first.folder_mode || "76",
    createdAt: first.folder_created_at,
    files: enrichedFiles,
  }
}

export const DESCRIPTION_MAX = 160
export const COMMAND_MAX = 100

export function validateLanding(description?: string, command?: string): string | null {
  if (description && description.length > DESCRIPTION_MAX) return `description must be ≤${DESCRIPTION_MAX} characters`
  if (command && command.length > COMMAND_MAX) return `command must be ≤${COMMAND_MAX} characters`
  return null
}

export async function getFolderTokenHash(db: DB, slug: string): Promise<{ id: string; tokenHash: string | null; mode: string } | null> {
  const row = await db.prepare("SELECT id, token_hash, mode FROM folders WHERE slug = ?").bind(slug).first() as any
  return row ? { id: row.id, tokenHash: row.token_hash, mode: row.mode || "76" } : null
}

export async function createFolder(
  db: DB,
  slug: string,
  title: string,
  files: { path: string; content: string }[],
  opts?: { description?: string; command?: string; tokenHash?: string; webhookUrl?: string; mode?: string },
) {
  const folderId = id()

  const stmts = [
    db.prepare("INSERT INTO folders (id, slug, title, description, command, token_hash, webhook_url, mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(folderId, slug, title, opts?.description || null, opts?.command || null, opts?.tokenHash || null, opts?.webhookUrl || null, opts?.mode || "76"),
    ...files.map((f, i) =>
      db.prepare(
        "INSERT INTO files (id, folder_id, path, content, sort_order) VALUES (?, ?, ?, ?, ?)"
      ).bind(id(), folderId, f.path, f.content, i)
    ),
  ]

  await db.batch(stmts)

  return { id: folderId, slug }
}

// ─── File operations ────────────────────────────────────────

export async function getFileBySlugAndPath(db: DB, slug: string, path: string) {
  const row = await db.prepare(
    `SELECT f.* FROM files f
     JOIN folders fo ON f.folder_id = fo.id
     WHERE fo.slug = ? AND f.path = ?`
  ).bind(slug, path).first()
  return row ? { id: row.id, path: row.path, content: row.content, language: row.language } : null
}

export async function replaceFile(db: DB, slug: string, path: string, content: string) {
  const file = await getFileBySlugAndPath(db, slug, path)
  if (file) {
    await db.prepare("UPDATE files SET content = ? WHERE id = ?").bind(content, file.id).run()
    return { id: file.id, path, created: false }
  }

  // Upsert: create new file if it doesn't exist
  const folder = await db.prepare("SELECT id FROM folders WHERE slug = ?").bind(slug).first()
  if (!folder) return null

  const last = await db.prepare(
    "SELECT MAX(sort_order) as max_sort FROM files WHERE folder_id = ?"
  ).bind(folder.id).first() as any
  const sortOrder = (last?.max_sort ?? -1) + 1

  const fileId = id()
  await db.prepare(
    "INSERT INTO files (id, folder_id, path, content, sort_order) VALUES (?, ?, ?, ?, ?)"
  ).bind(fileId, folder.id, path, content, sortOrder).run()
  return { id: fileId, path, created: true }
}

export async function deleteFile(db: DB, slug: string, path: string) {
  const file = await getFileBySlugAndPath(db, slug, path)
  if (!file) return null
  // Delete comments and replies for this file
  const comments = await db.prepare("SELECT id FROM comments WHERE file_id = ?").bind(file.id).all()
  const commentIds = comments.results.map((c: any) => c.id)
  if (commentIds.length > 0) {
    const ph = commentIds.map(() => "?").join(",")
    await db.prepare(`DELETE FROM replies WHERE comment_id IN (${ph})`).bind(...commentIds).run()
    await db.prepare(`DELETE FROM comments WHERE file_id = ?`).bind(file.id).run()
  }
  await db.prepare("DELETE FROM files WHERE id = ?").bind(file.id).run()
  return { id: file.id, path, deleted: true }
}

export async function patchFile(
  db: DB,
  slug: string,
  path: string,
  updates: { old_str: string; new_str: string }[],
) {
  const file = await getFileBySlugAndPath(db, slug, path)
  if (!file) return null

  let content = file.content as string
  const applied: string[] = []
  const failed: string[] = []

  for (const u of updates) {
    const idx = content.indexOf(u.old_str)
    if (idx === -1) {
      failed.push(u.old_str.slice(0, 60))
    } else {
      content = content.slice(0, idx) + u.new_str + content.slice(idx + u.old_str.length)
      applied.push(u.old_str.slice(0, 60))
    }
  }

  if (applied.length > 0) {
    await db.prepare("UPDATE files SET content = ? WHERE id = ?").bind(content, file.id).run()
  }

  return { id: file.id, path, applied: applied.length, failed: failed.length, failedMatches: failed }
}

// ─── Webhooks ────────────────────────────────────────────

export async function getWebhookUrl(db: DB, slug: string): Promise<string | null> {
  const row = await db.prepare("SELECT webhook_url FROM folders WHERE slug = ?").bind(slug).first() as any
  return row?.webhook_url || null
}

// ─── Comments ───────────────────────────────────────────────

export async function getComment(db: DB, commentId: string) {
  const c = await db.prepare("SELECT * FROM comments WHERE id = ?").bind(commentId).first() as any
  if (!c) return null

  const repliesResult = await db.prepare(
    "SELECT * FROM replies WHERE comment_id = ? ORDER BY created_at"
  ).bind(commentId).all()

  return {
    id: c.id,
    fileId: c.file_id,
    anchor: JSON.parse(c.anchor_json),
    body: c.body,
    author: c.author,
    createdAt: c.created_at,
    replies: repliesResult.results.map((r: any) => ({
      id: r.id,
      body: r.body,
      author: r.author,
      createdAt: r.created_at,
    })),
  }
}

export async function listComments(db: DB, fileId: string) {
  const comments = await db.prepare(
    "SELECT * FROM comments WHERE file_id = ? ORDER BY created_at"
  ).bind(fileId).all()

  const commentIds = comments.results.map((c: any) => c.id)
  let replies: any[] = []
  if (commentIds.length > 0) {
    const ph = commentIds.map(() => "?").join(",")
    const rResult = await db.prepare(
      `SELECT * FROM replies WHERE comment_id IN (${ph}) ORDER BY created_at`
    ).bind(...commentIds).all()
    replies = rResult.results
  }

  return comments.results.map((c: any) => ({
    id: c.id,
    anchor: JSON.parse(c.anchor_json),
    body: c.body,
    author: c.author,
    createdAt: c.created_at,
    replies: replies
      .filter((r: any) => r.comment_id === c.id)
      .map((r: any) => ({
        id: r.id,
        body: r.body,
        author: r.author,
        createdAt: r.created_at,
      })),
  }))
}

export async function addComment(
  db: DB,
  fileId: string,
  anchor: object,
  body: string,
  author: string,
) {
  const commentId = id()
  await db.prepare(
    "INSERT INTO comments (id, file_id, anchor_json, body, author) VALUES (?, ?, ?, ?, ?)"
  ).bind(commentId, fileId, JSON.stringify(anchor), body, author || "Anonymous").run()
  return { id: commentId }
}

export async function deleteComment(db: DB, commentId: string) {
  await db.prepare("DELETE FROM replies WHERE comment_id = ?").bind(commentId).run()
  await db.prepare("DELETE FROM comments WHERE id = ?").bind(commentId).run()
}

// ─── Replies ────────────────────────────────────────────────

export async function addReply(
  db: DB,
  commentId: string,
  body: string,
  author: string,
) {
  const replyId = id()
  await db.prepare(
    "INSERT INTO replies (id, comment_id, body, author) VALUES (?, ?, ?, ?)"
  ).bind(replyId, commentId, body, author || "Anonymous").run()
  return { id: replyId }
}
