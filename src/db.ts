type DB = D1Database

function id(): string {
  return crypto.randomUUID()
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

// ─── Tasks ──────────────────────────────────────────────────

export async function getTask(db: DB, slug: string) {
  const task = await db.prepare("SELECT * FROM tasks WHERE slug = ?").bind(slug).first()
  if (!task) return null

  const files = await db.prepare(
    "SELECT * FROM task_files WHERE task_id = ? ORDER BY sort_order, path"
  ).bind(task.id).all()

  const fileIds = files.results.map((f: any) => f.id)
  if (fileIds.length === 0) return { ...task, files: [] }

  // Fetch all comments for all files in this task
  const placeholders = fileIds.map(() => "?").join(",")
  const comments = await db.prepare(
    `SELECT * FROM comments WHERE file_id IN (${placeholders}) ORDER BY created_at`
  ).bind(...fileIds).all()

  // Fetch all replies for those comments
  const commentIds = comments.results.map((c: any) => c.id)
  let replies: any[] = []
  if (commentIds.length > 0) {
    const rPlaceholders = commentIds.map(() => "?").join(",")
    const rResult = await db.prepare(
      `SELECT * FROM replies WHERE comment_id IN (${rPlaceholders}) ORDER BY created_at`
    ).bind(...commentIds).all()
    replies = rResult.results
  }

  // Nest replies into comments, comments into files
  const commentMap = comments.results.map((c: any) => ({
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
    _fileId: c.file_id,
  }))

  const enrichedFiles = files.results.map((f: any) => ({
    id: f.id,
    path: f.path,
    content: f.content,
    language: f.language,
    comments: commentMap.filter((c: any) => c._fileId === f.id).map(({ _fileId, ...c }: any) => c),
  }))

  return {
    id: task.id,
    slug: task.slug,
    title: task.title,
    createdAt: task.created_at,
    files: enrichedFiles,
  }
}

export async function createTask(
  db: DB,
  slug: string,
  title: string,
  files: { path: string; content: string }[],
) {
  const taskId = id()

  const stmts = [
    db.prepare("INSERT INTO tasks (id, slug, title) VALUES (?, ?, ?)").bind(taskId, slug, title),
    ...files.map((f, i) =>
      db.prepare(
        "INSERT INTO task_files (id, task_id, path, content, sort_order) VALUES (?, ?, ?, ?, ?)"
      ).bind(id(), taskId, f.path, f.content, i)
    ),
  ]

  await db.batch(stmts)

  return { id: taskId, slug }
}

// ─── File operations ────────────────────────────────────────

export async function getFileBySlugAndPath(db: DB, slug: string, path: string) {
  const row = await db.prepare(
    `SELECT tf.* FROM task_files tf
     JOIN tasks t ON tf.task_id = t.id
     WHERE t.slug = ? AND tf.path = ?`
  ).bind(slug, path).first()
  return row ? { id: row.id, path: row.path, content: row.content, language: row.language } : null
}

export async function replaceFile(db: DB, slug: string, path: string, content: string) {
  const file = await getFileBySlugAndPath(db, slug, path)
  if (file) {
    await db.prepare("UPDATE task_files SET content = ? WHERE id = ?").bind(content, file.id).run()
    return { id: file.id, path, created: false }
  }

  // Upsert: create new file if it doesn't exist
  const task = await db.prepare("SELECT id FROM tasks WHERE slug = ?").bind(slug).first()
  if (!task) return null

  const last = await db.prepare(
    "SELECT MAX(sort_order) as max_sort FROM task_files WHERE task_id = ?"
  ).bind(task.id).first() as any
  const sortOrder = (last?.max_sort ?? -1) + 1

  const fileId = id()
  await db.prepare(
    "INSERT INTO task_files (id, task_id, path, content, sort_order) VALUES (?, ?, ?, ?, ?)"
  ).bind(fileId, task.id, path, content, sortOrder).run()
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
  await db.prepare("DELETE FROM task_files WHERE id = ?").bind(file.id).run()
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
    await db.prepare("UPDATE task_files SET content = ? WHERE id = ?").bind(content, file.id).run()
  }

  return { id: file.id, path, applied: applied.length, failed: failed.length, failedMatches: failed }
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
