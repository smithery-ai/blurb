#!/usr/bin/env bun
// Generates an OG image (1200x630) with a Barnsley fern, seeded with 42

const TRANSFORMS: [number, number, number, number, number, number, number][] = [
  [0.00, 0.00, 0.00, 0.16, 0.00, 0.00, 0.01],
  [0.85, 0.04, -0.04, 0.85, 0.00, 1.60, 0.85],
  [0.20, -0.26, 0.23, 0.22, 0.00, 1.60, 0.07],
  [-0.15, 0.28, 0.26, 0.24, 0.00, 0.44, 0.07],
]

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

const rng = mulberry32(42)
const W = 1200, H = 630

// Generate fern points
let x = 0, y = 0
const points: [number, number][] = []
const iters = 100000

for (let i = 0; i < iters; i++) {
  const r = rng()
  let cumP = 0
  let t = TRANSFORMS[0]
  for (const tr of TRANSFORMS) {
    cumP += tr[6]
    if (r <= cumP) { t = tr; break }
  }
  const nx = t[0] * x + t[1] * y + t[4]
  const ny = t[2] * x + t[3] * y + t[5]
  x = nx; y = ny
  if (i > 20) points.push([x, y])
}

// Find bounds
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
for (const [px, py] of points) {
  if (px < minX) minX = px
  if (px > maxX) maxX = px
  if (py < minY) minY = py
  if (py > maxY) maxY = py
}

// Map to pixel grid — fern on the right side
const rangeX = maxX - minX || 1
const rangeY = maxY - minY || 1
const charAspect = 1 // pixels, no char correction
const fernW = W * 0.5 // fern takes right half
const fernH = H - 80 // padding
const scale = Math.min(fernW / rangeX, fernH / rangeY)
const offX = W * 0.45 + (fernW - rangeX * scale) / 2
const offY = 40 + (fernH - rangeY * scale) / 2

const density: number[][] = Array.from({ length: H }, () => Array(W).fill(0))
let maxD = 0

for (const [px, py] of points) {
  const c = Math.round((px - minX) * scale + offX)
  const r = Math.round((maxY - py) * scale + offY)
  if (r >= 0 && r < H && c >= 0 && c < W) {
    density[r][c]++
    if (density[r][c] > maxD) maxD = density[r][c]
  }
}

// Build SVG with background, fern, and text
const dots: string[] = []
for (let r = 0; r < H; r++) {
  for (let c = 0; c < W; c++) {
    if (density[r][c] === 0) continue
    const norm = Math.sqrt(density[r][c] / maxD)
    const green = Math.round(80 + norm * 100)
    const opacity = (0.3 + norm * 0.7).toFixed(2)
    dots.push(`<rect x="${c}" y="${r}" width="2" height="2" fill="rgb(60,${green},40)" opacity="${opacity}"/>`)
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="#1a1816"/>
${dots.join("\n")}
<text x="80" y="280" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="72" font-weight="200" fill="#e8e6e3">Blurb</text>
<text x="80" y="330" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="300" fill="#e8e6e3" opacity="0.5">Beautiful collaborative gists for humans and agents.</text>
</svg>`

const { writeFileSync } = require("fs")
const { join } = require("path")
const outPath = join(import.meta.dir, "..", "app", "public", "og.svg")
writeFileSync(outPath, svg)
console.log(`wrote ${outPath} (${dots.length} pixels)`)
