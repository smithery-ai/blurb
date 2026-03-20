// Blocks until one SSE event arrives from hook.new, prints it, exits.
// Usage: bun run hook-listen.ts <stream_url> <watch_token>

const [streamUrl, watchToken] = Bun.argv.slice(2)

const res = await fetch(streamUrl, {
  headers: {
    "Authorization": `Bearer ${watchToken}`,
    "Accept": "text/event-stream",
  },
})

const reader = res.body!.getReader()
const decoder = new TextDecoder()
let buffer = ""

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  buffer += decoder.decode(value, { stream: true })

  const lines = buffer.split("\n")
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      console.log(line.slice(6))
      process.exit(0)
    }
  }
  buffer = lines[lines.length - 1]
}
