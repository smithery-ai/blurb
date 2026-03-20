// Pure fern generation logic — shared between client (Fern.tsx) and server (og.svg endpoint)
// No React or DOM dependencies

export type CellType = "stem" | "frond" | "tip"

export interface Cell {
  char: string
  type: CellType
}

const CHARS = ".,:;~=#%&@"

const TRANSFORMS: [number, number, number, number, number, number, number][] = [
  [0.00, 0.00, 0.00, 0.16, 0.00, 0.00, 0.01],
  [0.85, 0.04, -0.04, 0.85, 0.00, 1.60, 0.85],
  [0.20, -0.26, 0.23, 0.22, 0.00, 1.60, 0.07],
  [-0.15, 0.28, 0.26, 0.24, 0.00, 0.44, 0.07],
]

export const COLORS: Record<string, Record<CellType, string[]>> = {
  dark: {
    stem:  ["#7B6345", "#8B7355", "#6B5335"],
    frond: ["#4a7a3a", "#5a8a4a", "#3a6a2a", "#6a9a5a"],
    tip:   ["#7aaa6a", "#8aba7a", "#6a9a5a", "#9aca8a"],
  },
  light: {
    stem:  ["#4a3315", "#3a2305", "#5a4325"],
    frond: ["#1a5a0a", "#2a6a1a", "#0a4a00", "#1a5510"],
    tip:   ["#2a7a1a", "#3a8a2a", "#1a6a0a", "#2a7520"],
  },
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

export function generateGarden(cols: number, rows: number, seed: number): Cell[][] {
  const rng = mulberry32(seed)
  const rand = makeRand(rng)

  const grid: (Cell | null)[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null)
  )
  const density: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0)
  )

  const numFronds = Math.floor(rand(3, 5))
  const fronds: Frond[] = []

  for (let i = 0; i < numFronds; i++) {
    const baseAngle = -0.8 + (i / (numFronds - 1)) * 1.6
    const angle = baseAngle + rand(-0.1, 0.1)
    const scale = rand(0.6, 1.0)
    const ox = rand(-0.2, 0.2)
    const oy = rand(-0.1, 0.1)
    const iters = Math.floor(25000 * scale) + 15000
    fronds.push({ angle, scale, ox, oy, iters })
  }

  fronds.sort((a, b) => a.scale - b.scale)

  const allPoints: [number, number][] = []

  for (const frond of fronds) {
    let x = 0, y = 0
    const cos = Math.cos(frond.angle)
    const sin = Math.sin(frond.angle)

    for (let i = 0; i < frond.iters; i++) {
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

      if (i > 20) {
        const sx = x * frond.scale
        const sy = y * frond.scale
        const rx = sx * cos - sy * sin + frond.ox
        const ry = sx * sin + sy * cos + frond.oy
        allPoints.push([rx, ry])
      }
    }
  }

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

// Render a fern as clean pixel dots in SVG (for OG images)
export function renderFernSVG(opts: {
  seed: number
  title?: string
  description?: string
  width?: number
  height?: number
}): string {
  const width = opts.width ?? 1200
  const height = opts.height ?? 630
  const rng = mulberry32(opts.seed)
  const rand = makeRand(rng)

  // Generate fern fronds
  const numFronds = Math.floor(rand(3, 5))
  const fronds: Frond[] = []
  for (let i = 0; i < numFronds; i++) {
    const baseAngle = -0.8 + (i / (numFronds - 1)) * 1.6
    fronds.push({
      angle: baseAngle + rand(-0.1, 0.1),
      scale: rand(0.6, 1.0),
      ox: rand(-0.2, 0.2),
      oy: rand(-0.1, 0.1),
      iters: Math.floor(25000 * rand(0.6, 1.0)) + 10000,
    })
  }

  const allPoints: [number, number][] = []
  for (const frond of fronds) {
    let x = 0, y = 0
    const cos = Math.cos(frond.angle), sin = Math.sin(frond.angle)
    for (let i = 0; i < frond.iters; i++) {
      const r = rng()
      let cumP = 0, t = TRANSFORMS[0]
      for (const tr of TRANSFORMS) { cumP += tr[6]; if (r <= cumP) { t = tr; break } }
      const nx = t[0] * x + t[1] * y + t[4]
      const ny = t[2] * x + t[3] * y + t[5]
      x = nx; y = ny
      if (i > 20) {
        const sx = x * frond.scale, sy = y * frond.scale
        allPoints.push([sx * cos - sy * sin + frond.ox, sx * sin + sy * cos + frond.oy])
      }
    }
  }

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

  // Build dot rects
  const dots: string[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (density[r][c] === 0) continue
      const norm = Math.sqrt(density[r][c] / maxD)
      const green = Math.round(80 + norm * 120)
      const opacity = (0.3 + norm * 0.7).toFixed(2)
      const gap = 2
      dots.push(`<rect x="${c * cellSize}" y="${r * cellSize}" width="${cellSize - gap}" height="${cellSize - gap}" rx="1" fill="rgb(50,${green},35)" opacity="${opacity}"/>`)
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

// Generate fern as positioned dots for OG PNG rendering (via workers-og)
export function generateOgDots(seed: number): { x: number; y: number; s: number; g: number; o: number }[] {
  const rng = mulberry32(seed)
  const rand = makeRand(rng)
  const W = 1200, H = 630

  const numFronds = Math.floor(rand(3, 5))
  const fronds: Frond[] = []
  for (let i = 0; i < numFronds; i++) {
    const baseAngle = -0.8 + (i / (numFronds - 1)) * 1.6
    fronds.push({
      angle: baseAngle + rand(-0.1, 0.1),
      scale: rand(0.6, 1.0),
      ox: rand(-0.2, 0.2),
      oy: rand(-0.1, 0.1),
      iters: Math.floor(25000 * rand(0.6, 1.0)) + 10000,
    })
  }

  const allPoints: [number, number][] = []
  for (const frond of fronds) {
    let x = 0, y = 0
    const cos = Math.cos(frond.angle), sin = Math.sin(frond.angle)
    for (let i = 0; i < frond.iters; i++) {
      const r = rng()
      let cumP = 0, t = TRANSFORMS[0]
      for (const tr of TRANSFORMS) { cumP += tr[6]; if (r <= cumP) { t = tr; break } }
      const nx = t[0] * x + t[1] * y + t[4]
      const ny = t[2] * x + t[3] * y + t[5]
      x = nx; y = ny
      if (i > 20) {
        const sx = x * frond.scale, sy = y * frond.scale
        allPoints.push([sx * cos - sy * sin + frond.ox, sx * sin + sy * cos + frond.oy])
      }
    }
  }

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
