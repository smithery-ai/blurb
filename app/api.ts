import type { Anchor } from "sono-editor"

export async function fetchFolder(slug: string) {
  const res = await fetch(`/~/public/${slug}`, {
    headers: { "Accept": "application/json" },
  })
  if (!res.ok) return null
  return res.json()
}

export async function createFolder(title: string, files: { path: string; content: string }[]) {
  const res = await fetch("/~/public", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, files }),
  })
  return res.json()
}

export async function postComment(slug: string, path: string, anchor: Anchor, body: string, author?: string) {
  const res = await fetch(`/~/public/${slug}/${path}/@comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ anchor, body, author }),
  })
  return res.json()
}

export async function deleteComment(slug: string, path: string, commentId: string) {
  await fetch(`/~/public/${slug}/${path}/@comments/${commentId}`, { method: "DELETE" })
}

export async function postReply(slug: string, path: string, commentId: string, body: string, author?: string) {
  const res = await fetch(`/~/public/${slug}/${path}/@comments/${commentId}/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body, author }),
  })
  return res.json()
}
