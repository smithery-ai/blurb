#!/usr/bin/env bun
// Generates a Barnsley fern SVG favicon

const TRANSFORMS: [number, number, number, number, number, number, number][] = [
  [0.00, 0.00, 0.00, 0.16, 0.00, 0.00, 0.01],
  [0.85, 0.04, -0.04, 0.85, 0.00, 1.60, 0.85],
  [0.20, -0.26, 0.23, 0.22, 0.00, 1.60, 0.07],
  [-0.15, 0.28, 0.26, 0.24, 0.00, 0.44, 0.07],
]

// Seeded PRNG (mulberry32)
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

const rng = mulberry32(42)

// Generate fern points
let x = 0, y = 0
const points: [number, number][] = []
const iters = 30000

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
  x = nx
  y = ny
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

// Map to a 32x32 grid for density
const size = 32
const pad = 2
const usable = size - pad * 2
const rangeX = maxX - minX || 1
const rangeY = maxY - minY || 1
const scale = Math.min(usable / rangeX, usable / rangeY)
const offX = pad + (usable - rangeX * scale) / 2
const offY = pad + (usable - rangeY * scale) / 2

const density: number[][] = Array.from({ length: size }, () => Array(size).fill(0))
let maxD = 0

for (const [px, py] of points) {
  const c = Math.round((px - minX) * scale + offX)
  const r = Math.round((maxY - py) * scale + offY) // flip Y
  if (r >= 0 && r < size && c >= 0 && c < size) {
    density[r][c]++
    if (density[r][c] > maxD) maxD = density[r][c]
  }
}

// Generate SVG with rounded rect background and fern dots
const rects: string[] = []
for (let r = 0; r < size; r++) {
  for (let c = 0; c < size; c++) {
    if (density[r][c] === 0) continue
    const norm = Math.sqrt(density[r][c] / maxD)
    const green = Math.round(80 + norm * 100) // 80-180
    const opacity = 0.4 + norm * 0.6
    rects.push(`<rect x="${c}" y="${r}" width="1" height="1" fill="rgb(60,${green},40)" opacity="${opacity.toFixed(2)}"/>`)
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
${rects.join("\n")}
</svg>`

// Write SVG
const { writeFileSync } = require("fs")
const { join } = require("path")
const outPath = join(import.meta.dir, "..", "app", "public", "favicon.svg")
writeFileSync(outPath, svg)
console.log(`wrote ${outPath} (${rects.length} pixels)`)
