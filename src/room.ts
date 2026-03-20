import { DurableObject } from "cloudflare:workers"

export type RoomEvent =
  | { type: "comment:created"; fileId: string; comment: any }
  | { type: "comment:deleted"; fileId: string; commentId: string }
  | { type: "reply:created"; fileId: string; commentId: string; reply: any }
  | { type: "file:updated"; fileId: string; path: string; content: string }
  | { type: "file:created"; fileId: string; path: string; content: string }
  | { type: "file:deleted"; fileId: string; path: string }
  | { type: "folder:replaced"; slug: string }

export class DocumentRoom extends DurableObject {
  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env)
    // Auto ping/pong without waking the DO
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong")
    )
  }

  async fetch(request: Request): Promise<Response> {
    // WebSocket upgrade — new viewer connecting
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair()
      this.ctx.acceptWebSocket(pair[1])
      return new Response(null, { status: 101, webSocket: pair[0] })
    }

    // POST /broadcast — Worker notifying about a mutation
    if (request.method === "POST") {
      const event = await request.json()
      const msg = JSON.stringify(event)
      for (const ws of this.ctx.getWebSockets()) {
        try { ws.send(msg) } catch { /* dead socket, will get cleaned up on close */ }
      }
      return new Response("ok")
    }

    return new Response("not found", { status: 404 })
  }

  webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer) {
    // Clients don't send meaningful messages (yet)
  }

  webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean) {
    ws.close()
  }

  webSocketError(ws: WebSocket, _error: unknown) {
    ws.close()
  }
}
