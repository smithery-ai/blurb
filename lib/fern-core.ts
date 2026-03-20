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

// Render a fern grid to an SVG string (for OG images)
export function renderFernSVG(opts: {
  seed: number
  title?: string
  description?: string
  cols?: number
  rows?: number
  width?: number
  height?: number
}): string {
  const cols = opts.cols ?? 80
  const rows = opts.rows ?? 36
  const width = opts.width ?? 1200
  const height = opts.height ?? 630
  const grid = generateGarden(cols, rows, opts.seed)
  const colors = COLORS.dark

  const fontSize = 14
  const charW = 8.4
  const lineH = 15.4
  const gridW = cols * charW
  const gridH = rows * lineH
  const fernX = width - gridW - 40
  const fernY = (height - gridH) / 2

  const rowEls: string[] = []
  for (let r = 0; r < rows; r++) {
    const spans: string[] = []
    let run = ""
    let runColor = ""

    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c]
      if (cell.char === " ") {
        if (run) { spans.push(`<tspan fill="${runColor}">${escapeXml(run)}</tspan>`); run = "" }
        spans.push(" ")
        continue
      }
      const palette = colors[cell.type]
      const color = palette[(r + c) % palette.length]
      if (color === runColor) {
        run += cell.char
      } else {
        if (run) spans.push(`<tspan fill="${runColor}">${escapeXml(run)}</tspan>`)
        run = cell.char
        runColor = color
      }
    }
    if (run) spans.push(`<tspan fill="${runColor}">${escapeXml(run)}</tspan>`)

    rowEls.push(`<text x="${fernX}" y="${fernY + r * lineH}" font-family="'SF Mono','Menlo','Consolas',monospace" font-size="${fontSize}" xml:space="preserve">${spans.join("")}</text>`)
  }

  // Hash label
  const hashLabel = `[#${(opts.seed >>> 0).toString(16).padStart(8, "0")}]`
  rowEls.push(`<text x="${fernX + gridW / 2}" y="${fernY + gridH + 24}" font-family="'SF Mono','Menlo','Consolas',monospace" font-size="${fontSize}" fill="#ffffff" opacity="0.2" text-anchor="middle" letter-spacing="0.15em">${hashLabel}</text>`)

  // Title + description top-left
  const titleEls: string[] = []
  if (opts.title) {
    titleEls.push(`<text x="60" y="90" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="64" font-weight="300" fill="#ffffff">${escapeXml(opts.title)}</text>`)
  }
  if (opts.description) {
    const desc = opts.description.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    const maxCharsPerLine = 25
    const words = desc.split(" ")
    const lines: string[] = []
    let line = ""
    for (const word of words) {
      if (line && (line + " " + word).length > maxCharsPerLine) {
        lines.push(line)
        line = word
      } else {
        line = line ? line + " " + word : word
      }
    }
    if (line) lines.push(line)
    const wrapped = lines
    wrapped.forEach((l, i) => {
      titleEls.push(`<text x="60" y="${148 + i * 40}" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="32" font-weight="300" fill="#ffffff" opacity="0.4">${escapeXml(l)}</text>`)
    })
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
<rect width="${width}" height="${height}" fill="#1a1816"/>
${titleEls.join("\n")}
${rowEls.join("\n")}
</svg>`
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}
