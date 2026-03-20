import type { Anchor } from "engei"

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string }

async function api<T>(res: Response): Promise<ApiResult<T>> {
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    return { ok: false, status: res.status, error: text }
  }
  return { ok: true, data: await res.json() as T }
}

export async function fetchFolder(slug: string) {
  // Use server-inlined data if available (eliminates JSON fetch round-trip)
  const inlined = (window as any).__FOLDER_DATA__
  if (inlined && inlined.slug === slug) {
    delete (window as any).__FOLDER_DATA__ // consume once
    return inlined
  }
  const res = await fetch(`/~/public/${slug}`, {
    headers: { "Accept": "application/json" },
  })
  if (!res.ok) return null
  return res.json()
}

export async function createFolder(title: string, files: { path: string; content: string }[], token?: string) {
  const res = await fetch("/~/public", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, files, token }),
  })
  return res.json() as Promise<{ id: string; slug: string; token: string }>
}

export async function postComment(slug: string, path: string, anchor: Anchor, body: string, author?: string): Promise<ApiResult<{ id: string }>> {
  const res = await fetch(`/~/public/${slug}/${path}/@comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ anchor, body, author }),
  })
  return api(res)
}

export async function deleteComment(slug: string, path: string, commentId: string): Promise<ApiResult<{ ok: boolean }>> {
  const res = await fetch(`/~/public/${slug}/${path}/@comments/${commentId}`, { method: "DELETE" })
  return api(res)
}

export async function postReply(slug: string, path: string, commentId: string, body: string, author?: string): Promise<ApiResult<{ id: string }>> {
  const res = await fetch(`/~/public/${slug}/${path}/@comments/${commentId}/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body, author }),
  })
  return api(res)
}
