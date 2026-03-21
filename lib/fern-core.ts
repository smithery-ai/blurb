// Pure botanical generation logic — shared between client (Fern.tsx) and server (og.svg endpoint)
// No React or DOM dependencies

export type CellType = "stem" | "frond" | "tip"
export type ShapeType = "fern" | "leaf" | "twig"

export interface Cell {
  char: string
  type: CellType
}

const CHARS = ".,:;~=#%&@"

// ─── IFS transforms: [a, b, c, d, e, f, probability] ────────

type IFS = [number, number, number, number, number, number, number][]

const FERN_IFS: IFS = [
  [0.00, 0.00, 0.00, 0.16, 0.00, 0.00, 0.01],
  [0.85, 0.04, -0.04, 0.85, 0.00, 1.60, 0.85],
  [0.20, -0.26, 0.23, 0.22, 0.00, 1.60, 0.07],
  [-0.15, 0.28, 0.26, 0.24, 0.00, 0.44, 0.07],
]

const LEAF_IFS: IFS = [
  [0.14, 0.01, 0.00, 0.51, -0.08, -1.31, 0.10],
  [0.43, 0.52, -0.45, 0.50, 1.49, -0.75, 0.35],
  [0.45, -0.49, 0.47, 0.47, -1.62, -0.74, 0.35],
  [0.49, 0.00, 0.00, 0.51, 0.02, 1.62, 0.20],
]

// ─── Per-shape color palettes ────────────────────────────────

const SHAPE_COLORS: Record<ShapeType, Record<string, Record<CellType, string[]>>> = {
  fern: {
    dark: {
      stem:  ["#7B6345", "#8B7355", "#6B5335"],
      frond: ["#4a7a3a", "#5a8a4a", "#3a6a2a", "#6a9a5a"],
      tip:   ["#7aaa6a", "#8aba7a", "#6a9a5a", "#9aca8a"],
    },
    light: {
      stem:  ["#3a2510", "#2a1800", "#4a3218"],
      frond: ["#0a4500", "#1a5510", "#004000", "#105008"],
      tip:   ["#1a6510", "#2a7520", "#0a5500", "#1a6018"],
    },
  },
  leaf: {
    dark: {
      stem:  ["#8B6914", "#9B7924", "#7B5904"],
      frond: ["#6a8a2a", "#7a9a3a", "#5a7a1a", "#8aaa4a"],
      tip:   ["#aaba5a", "#baca6a", "#9aaa4a", "#cada7a"],
    },
    light: {
      stem:  ["#4a3008", "#3a2000", "#5a4018"],
      frond: ["#2a5500", "#3a6508", "#1a4500", "#3a6008"],
      tip:   ["#4a7508", "#5a8518", "#3a6500", "#4a7018"],
    },
  },
  twig: {
    dark: {
      stem:  ["#8B7355", "#9B8365", "#7B6345"],
      frond: ["#7a6a5a", "#8a7a6a", "#6a5a4a", "#9a8a7a"],
      tip:   ["#aa9a8a", "#baaa9a", "#9a8a7a", "#cabaaa"],
    },
    light: {
      stem:  ["#2a1808", "#1a0800", "#3a2818"],
      frond: ["#4a3a28", "#5a4a38", "#3a2a18", "#4a3520"],
      tip:   ["#6a5a48", "#7a6a58", "#5a4a38", "#6a5540"],
    },
  },
}

// SVG/OG dot colors per shape
const SVG_DOT_COLORS: Record<ShapeType, { base: number; range: number; r: (v: number) => number; g: (v: number) => number; b: (v: number) => number }> = {
  fern:   { base: 80, range: 120, r: () => 50, g: v => v, b: () => 35 },
  leaf:   { base: 80, range: 120, r: v => Math.round(v * 0.5), g: v => v, b: () => 20 },
  twig:   { base: 60, range: 100, r: v => v, g: v => Math.round(v * 0.8), b: v => Math.round(v * 0.5) },
}

// Legacy export — picks colors based on shape
export const COLORS: Record<string, Record<CellType, string[]>> = SHAPE_COLORS.fern

export function getShapeColors(shape: ShapeType): Record<string, Record<CellType, string[]>> {
  return SHAPE_COLORS[shape]
}

export function pickShape(seed: number): ShapeType {
  const shapes: ShapeType[] = ["fern", "leaf", "twig"]
  return shapes[((seed >>> 0) % shapes.length)]
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

export function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0
  }
  return h
}

function makeRand(rng: () => number) {
  return (min: number, max: number) => min + rng() * (max - min)
}

interface Frond {
  angle: number
  scale: number
  ox: number
  oy: number
  iters: number
}

// ─── Shape point generators ─────────────────────────────────

function generateFernPoints(rng: () => number, rand: (min: number, max: number) => number): [number, number][] {
  const numFronds = Math.floor(rand(3, 5))
  const fronds: Frond[] = []
  for (let i = 0; i < numFronds; i++) {
    const baseAngle = -0.8 + (i / (numFronds - 1)) * 1.6
    fronds.push({
      angle: baseAngle + rand(-0.1, 0.1),
      scale: rand(0.6, 1.0),
      ox: rand(-0.2, 0.2),
      oy: rand(-0.1, 0.1),
      iters: Math.floor(25000 * rand(0.6, 1.0)) + 15000,
    })
  }
  fronds.sort((a, b) => a.scale - b.scale)

  const points: [number, number][] = []
  for (const frond of fronds) {
    let x = 0, y = 0
    const cos = Math.cos(frond.angle), sin = Math.sin(frond.angle)
    for (let i = 0; i < frond.iters; i++) {
      const r = rng()
      let cumP = 0, t = FERN_IFS[0]
      for (const tr of FERN_IFS) { cumP += tr[6]; if (r <= cumP) { t = tr; break } }
      const nx = t[0] * x + t[1] * y + t[4]
      const ny = t[2] * x + t[3] * y + t[5]
      x = nx; y = ny
      if (i > 20) {
        const sx = x * frond.scale, sy = y * frond.scale
        points.push([sx * cos - sy * sin + frond.ox, sx * sin + sy * cos + frond.oy])
      }
    }
  }
  return points
}

function generateLeafPoints(rng: () => number, rand: (min: number, max: number) => number): [number, number][] {
  const points: [number, number][] = []
  const iters = Math.floor(rand(60000, 80000))
  // Single leaf with slight random rotation
  const angle = rand(-0.15, 0.15)
  const cos = Math.cos(angle), sin = Math.sin(angle)
  let x = 0, y = 0
  for (let i = 0; i < iters; i++) {
    const r = rng()
    let cumP = 0, t = LEAF_IFS[0]
    for (const tr of LEAF_IFS) { cumP += tr[6]; if (r <= cumP) { t = tr; break } }
    const nx = t[0] * x + t[1] * y + t[4]
    const ny = t[2] * x + t[3] * y + t[5]
    x = nx; y = ny
    if (i > 20) {
      points.push([x * cos - y * sin, x * sin + y * cos])
    }
  }
  return points
}

function generateTwigPoints(rng: () => number, rand: (min: number, max: number) => number): [number, number][] {
  const points: [number, number][] = []

  function branch(x: number, y: number, angle: number, len: number, width: number, depth: number) {
    if (depth <= 0 || len < 0.05) return
    const steps = Math.floor(len * 200)
    const endX = x + Math.cos(angle) * len
    const endY = y + Math.sin(angle) * len
    // Draw the branch with thickness
    for (let i = 0; i < steps; i++) {
      const t = i / steps
      const px = x + (endX - x) * t
      const py = y + (endY - y) * t
      const w = width * (1 - t * 0.5)
      for (let j = 0; j < Math.ceil(w * 8); j++) {
        const off = rand(-w, w) * 0.3
        const perpX = -Math.sin(angle) * off
        const perpY = Math.cos(angle) * off
        points.push([px + perpX, py + perpY])
      }
    }

    // Sub-branches
    const numSub = Math.floor(rand(2, 4))
    for (let i = 0; i < numSub; i++) {
      const t = rand(0.3, 0.9)
      const bx = x + (endX - x) * t
      const by = y + (endY - y) * t
      const spread = rand(0.3, 0.9) * (rng() > 0.5 ? 1 : -1)
      const childLen = len * rand(0.4, 0.7)
      branch(bx, by, angle + spread, childLen, width * 0.6, depth - 1)
    }

    // Leaf clusters at tips
    if (depth <= 2) {
      for (let i = 0; i < 80; i++) {
        const lr = rand(0, 0.4)
        const la = rand(0, Math.PI * 2)
        points.push([endX + lr * Math.cos(la), endY + lr * Math.sin(la)])
      }
    }
  }

  const numBranches = Math.floor(rand(2, 4))
  for (let i = 0; i < numBranches; i++) {
    const baseAngle = Math.PI / 2 + rand(-0.4, 0.4)
    const ox = rand(-0.5, 0.5)
    branch(ox, 0, baseAngle, rand(2.5, 4), rand(0.1, 0.2), Math.floor(rand(3, 5)))
  }

  return points
}

function generateShapePoints(shape: ShapeType, rng: () => number, rand: (min: number, max: number) => number): [number, number][] {
  switch (shape) {
    case "fern": return generateFernPoints(rng, rand)
    case "leaf": return generateLeafPoints(rng, rand)

    case "twig": return generateTwigPoints(rng, rand)
  }
}

export function generateGarden(cols: number, rows: number, seed: number): Cell[][] {
  const shape = pickShape(seed)
  const rng = mulberry32(seed)
  const rand = makeRand(rng)

  const grid: (Cell | null)[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null)
  )
  const density: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0)
  )

  const allPoints = generateShapePoints(shape, rng, rand)

  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  for (const [px, py] of allPoints) {
    if (px < minX) minX = px
    if (px > maxX) maxX = px
    if (py < minY) minY = py
    if (py > maxY) maxY = py
  }

  const padX = 2, padY = 1
  const usableCols = cols - padX * 2
  const usableRows = rows - padY * 2
  const rangeX = maxX - minX || 1
  const rangeY = maxY - minY || 1

  const charAspect = 2.0
  const scaleX = usableCols / (rangeX * charAspect)
  const scaleY = usableRows / rangeY
  const scale = Math.min(scaleX, scaleY)

  const effectiveW = rangeX * charAspect * scale
  const offsetC = padX + Math.floor((usableCols - effectiveW) / 2)
  const offsetR = padY + Math.floor((usableRows - rangeY * scale) / 2)

  for (const [px, py] of allPoints) {
    const c = Math.round((px - minX) * charAspect * scale + offsetC)
    const r = Math.round((maxY - py) * scale + offsetR)
    if (r >= 0 && r < rows && c >= 0 && c < cols) {
      density[r][c]++
    }
  }

  let maxD = 0
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (density[r][c] > maxD) maxD = density[r][c]

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const d = density[r][c]
      if (d === 0) continue

      const yNorm = r / rows
      const xNorm = Math.abs(c - cols / 2) / (cols / 2)
      let type: CellType
      if (yNorm > 0.88) {
        type = "stem"
      } else if (yNorm < 0.1 || xNorm > 0.7) {
        type = "tip"
      } else {
        type = "frond"
      }

      const norm = Math.sqrt(d / maxD)
      const charIdx = Math.min(Math.floor(norm * CHARS.length), CHARS.length - 1)
      grid[r][c] = { char: CHARS[charIdx], type }
    }
  }

  return grid.map(row =>
    row.map(cell => cell || { char: " ", type: "frond" as CellType })
  )
}

// Render as clean pixel dots in SVG (for OG images)
export function renderFernSVG(opts: {
  seed: number
  title?: string
  description?: string
  width?: number
  height?: number
}): string {
  const width = opts.width ?? 1200
  const height = opts.height ?? 630
  const shape = pickShape(opts.seed)
  const rng = mulberry32(opts.seed)
  const rand = makeRand(rng)

  const allPoints = generateShapePoints(shape, rng, rand)

  // Find bounds
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [px, py] of allPoints) {
    if (px < minX) minX = px; if (px > maxX) maxX = px
    if (py < minY) minY = py; if (py > maxY) maxY = py
  }

  // Map to right 55% of image
  const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1
  const fernW = width * 0.5, fernH = height - 60
  const scale = Math.min(fernW / rangeX, fernH / rangeY)
  const offX = width * 0.45 + (fernW - rangeX * scale) / 2
  const offY = 30 + (fernH - rangeY * scale) / 2

  // Bucket into pixel cells
  const cellSize = 6
  const cols = Math.ceil(width / cellSize), rows = Math.ceil(height / cellSize)
  const density: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0))
  let maxD = 0

  for (const [px, py] of allPoints) {
    const c = Math.floor(((px - minX) * scale + offX) / cellSize)
    const r = Math.floor(((maxY - py) * scale + offY) / cellSize)
    if (r >= 0 && r < rows && c >= 0 && c < cols) {
      density[r][c]++
      if (density[r][c] > maxD) maxD = density[r][c]
    }
  }

  // Build dot rects — color based on shape
  const svgColor = SVG_DOT_COLORS[shape]
  const dots: string[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (density[r][c] === 0) continue
      const norm = Math.sqrt(density[r][c] / maxD)
      const channel = Math.round(svgColor.base + norm * svgColor.range)
      const opacity = (0.3 + norm * 0.7).toFixed(2)
      const gap = 2
      dots.push(`<rect x="${c * cellSize}" y="${r * cellSize}" width="${cellSize - gap}" height="${cellSize - gap}" rx="1" fill="rgb(${svgColor.r(channel)},${svgColor.g(channel)},${svgColor.b(channel)})" opacity="${opacity}"/>`)
    }
  }

  // Title + description
  const titleEls: string[] = []
  if (opts.title) {
    titleEls.push(`<text x="60" y="100" font-family="Inter,sans-serif" font-size="64" font-weight="300" fill="#e8e6e3">${escapeXml(opts.title)}</text>`)
  }
  if (opts.description) {
    const desc = opts.description.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    const words = desc.split(" ")
    const lines: string[] = []
    let line = ""
    for (const word of words) {
      if (line && (line + " " + word).length > 28) { lines.push(line); line = word }
      else { line = line ? line + " " + word : word }
    }
    if (line) lines.push(line)
    lines.forEach((l, i) => {
      titleEls.push(`<text x="60" y="${155 + i * 36}" font-family="Inter,sans-serif" font-size="24" font-weight="300" fill="#e8e6e3" opacity="0.4">${escapeXml(l)}</text>`)
    })
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
<rect width="${width}" height="${height}" fill="#1a1816"/>
${dots.join("\n")}
${titleEls.join("\n")}
</svg>`
}

// Generate as positioned dots for OG PNG rendering (via workers-og)
export function generateOgDots(seed: number): { x: number; y: number; s: number; g: number; o: number }[] {
  const shape = pickShape(seed)
  const rng = mulberry32(seed)
  const rand = makeRand(rng)
  const W = 1200, H = 630

  const allPoints = generateShapePoints(shape, rng, rand)

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [px, py] of allPoints) {
    if (px < minX) minX = px; if (px > maxX) maxX = px
    if (py < minY) minY = py; if (py > maxY) maxY = py
  }

  const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1
  const fernW = W * 0.5, fernH = H - 60
  const scale = Math.min(fernW / rangeX, fernH / rangeY)
  const offX = W * 0.45 + (fernW - rangeX * scale) / 2
  const offY = 30 + (fernH - rangeY * scale) / 2

  // Bucket into cells (larger = fewer dots for workers-og perf)
  const cellSize = 12
  const cols = Math.ceil(W / cellSize), rows = Math.ceil(H / cellSize)
  const density: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0))
  let maxD = 0

  for (const [px, py] of allPoints) {
    const c = Math.floor(((px - minX) * scale + offX) / cellSize)
    const r = Math.floor(((maxY - py) * scale + offY) / cellSize)
    if (r >= 0 && r < rows && c >= 0 && c < cols) {
      density[r][c]++
      if (density[r][c] > maxD) maxD = density[r][c]
    }
  }

  const dots: { x: number; y: number; s: number; g: number; o: number }[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (density[r][c] === 0) continue
      const norm = Math.sqrt(density[r][c] / maxD)
      dots.push({
        x: c * cellSize, y: r * cellSize, s: cellSize,
        g: Math.round(80 + norm * 100),
        o: Math.round((0.3 + norm * 0.7) * 100) / 100,
      })
    }
  }
  return dots
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}
