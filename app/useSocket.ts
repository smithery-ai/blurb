import { useEffect, useRef, useCallback } from "react"

type SocketEvent =
  | { type: "comment:created"; fileId: string; comment: any }
  | { type: "comment:deleted"; fileId: string; commentId: string }
  | { type: "reply:created"; fileId: string; commentId: string; reply: any }
  | { type: "file:updated"; fileId: string; path: string; content: string }
  | { type: "file:created"; fileId: string; path: string; content: string }
  | { type: "file:deleted"; fileId: string; path: string }
  | { type: "folder:replaced"; slug: string }

export function useDocumentSocket(
  slug: string | null,
  onEvent: (event: SocketEvent) => void,
) {
  const wsRef = useRef<WebSocket | null>(null)
  const retriesRef = useRef(0)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const connect = useCallback(() => {
    if (!slug) return
    const proto = location.protocol === "https:" ? "wss:" : "ws:"
    const ws = new WebSocket(`${proto}//${location.host}/~/public/${slug}/@ws`)

    ws.onopen = () => { retriesRef.current = 0 }

    ws.onmessage = (e) => {
      if (e.data === "pong") return
      try {
        const event = JSON.parse(e.data) as SocketEvent
        onEventRef.current(event)
      } catch { /* ignore malformed */ }
    }

    ws.onclose = () => {
      wsRef.current = null
      // Reconnect with exponential backoff (max 30s)
      const delay = Math.min(1000 * 2 ** retriesRef.current, 30000)
      retriesRef.current++
      setTimeout(connect, delay)
    }

    ws.onerror = () => { ws.close() }

    wsRef.current = ws
  }, [slug])

  useEffect(() => {
    connect()
    return () => {
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])
}
