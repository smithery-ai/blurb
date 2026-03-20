// resvg-wasm wrapper for Cloudflare Workers
// Wrangler handles .wasm imports as WebAssembly.Module
import resvgWasm from "../node_modules/@resvg/resvg-wasm/index_bg.wasm"
import { initWasm, Resvg } from "@resvg/resvg-wasm"

let initialized = false

let fontData: Uint8Array[] | null = null

export async function svgToPng(svg: string, width?: number): Promise<Uint8Array> {
  if (!initialized) {
    await initWasm(resvgWasm as unknown as WebAssembly.Module)
    initialized = true
  }

  // Fetch fonts for text rendering (cached after first use)
  if (!fontData) {
    const [sansRes, monoRes] = await Promise.all([
      fetch("https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-300-normal.woff2"),
      fetch("https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@latest/latin-400-normal.woff2"),
    ])
    fontData = [
      new Uint8Array(await sansRes.arrayBuffer()),
      new Uint8Array(await monoRes.arrayBuffer()),
    ]
  }

  const resvg = new Resvg(svg, {
    fitTo: width ? { mode: "width" as const, value: width } : undefined,
    font: {
      fontBuffers: fontData,
      defaultFontFamily: "Inter",
    },
  })
  const rendered = resvg.render()
  return rendered.asPng()
}
