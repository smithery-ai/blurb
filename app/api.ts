import type { Anchor } from "sono-editor"

export async function fetchTask(slug: string) {
  const res = await fetch(`/api/tasks/${slug}`)
  if (!res.ok) return null
  return res.json()
}

export async function createTask(title: string, files: { path: string; content: string }[]) {
  const res = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, files }),
  })
  return res.json()
}

export async function postComment(fileId: string, anchor: Anchor, body: string, author?: string) {
  const res = await fetch("/api/comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId, anchor, body, author }),
  })
  return res.json()
}

export async function deleteComment(commentId: string) {
  await fetch(`/api/comments/${commentId}`, { method: "DELETE" })
}

export async function postReply(commentId: string, body: string, author?: string) {
  const res = await fetch("/api/replies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commentId, body, author }),
  })
  return res.json()
}
