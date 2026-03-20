import { useMemo } from "react"

// ASCII garden fern — multiple Barnsley fern fronds fanning from a center
// Like a snapshot of a potted fern plant (engei = 園芸 = gardening)

type CellType = "stem" | "frond" | "tip"

interface Cell {
  char: string
  type: CellType
}

// Light → heavy density characters
const CHARS = ".,:;~=#%&@"

// Barnsley fern IFS transforms with probabilities
// Each: [a, b, c, d, e, f, probability]
const TRANSFORMS: [number, number, number, number, number, number, number][] = [
  [0.00, 0.00, 0.00, 0.16, 0.00, 0.00, 0.01],
  [0.85, 0.04, -0.04, 0.85, 0.00, 1.60, 0.85],
  [0.20, -0.26, 0.23, 0.22, 0.00, 1.60, 0.07],
  [-0.15, 0.28, 0.26, 0.24, 0.00, 0.44, 0.07],
]

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}

interface Frond {
  angle: number    // rotation in radians
  scale: number    // size multiplier
  ox: number       // origin offset X (in fern-space)
  oy: number       // origin offset Y
  iters: number    // iterations for this frond
}

function generateGarden(cols: number, rows: number): Cell[][] {
  const grid: (Cell | null)[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null)
  )
  const density: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0)
  )

  // A few distinct fronds fanning out — clear separation between each
  const numFronds = Math.floor(rand(3, 5))
  const fronds: Frond[] = []

  for (let i = 0; i < numFronds; i++) {
    // Wide fan with clear gaps between fronds
    const baseAngle = -0.8 + (i / (numFronds - 1)) * 1.6
    const angle = baseAngle + rand(-0.1, 0.1)
    const scale = rand(0.6, 1.0)
    const ox = rand(-0.2, 0.2)
    const oy = rand(-0.1, 0.1)
    const iters = Math.floor(25000 * scale) + 15000
    fronds.push({ angle, scale, ox, oy, iters })
  }

  // Sort by scale so smaller (background) fronds render first
  fronds.sort((a, b) => a.scale - b.scale)

  // Generate all points from all fronds
  const allPoints: [number, number][] = []

  for (const frond of fronds) {
    let x = 0, y = 0
    const cos = Math.cos(frond.angle)
    const sin = Math.sin(frond.angle)

    for (let i = 0; i < frond.iters; i++) {
      const r = Math.random()
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
        // Scale, rotate, and offset
        const sx = x * frond.scale
        const sy = y * frond.scale
        const rx = sx * cos - sy * sin + frond.ox
        const ry = sx * sin + sy * cos + frond.oy
        allPoints.push([rx, ry])
      }
    }
  }

  // Find bounds
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  for (const [px, py] of allPoints) {
    if (px < minX) minX = px
    if (px > maxX) maxX = px
    if (py < minY) minY = py
    if (py > maxY) maxY = py
  }

  // Map to grid
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

  // Find max density
  let maxD = 0
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (density[r][c] > maxD) maxD = density[r][c]

  // Convert density to characters
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

const COLORS: Record<string, Record<CellType, string[]>> = {
  dark: {
    stem:  ["#7B6345", "#8B7355", "#6B5335"],
    frond: ["#4a7a3a", "#5a8a4a", "#3a6a2a", "#6a9a5a"],
    tip:   ["#7aaa6a", "#8aba7a", "#6a9a5a", "#9aca8a"],
  },
  light: {
    stem:  ["#5B4325", "#6B5335", "#4B3315"],
    frond: ["#2a6a1a", "#3a7a2a", "#1a5a0a", "#4a8a3a"],
    tip:   ["#5a9a4a", "#6aaa5a", "#4a8a3a", "#7aba6a"],
  },
}

export default function Bonsai({ theme }: { theme: "dark" | "light" }) {
  const grid = useMemo(() => generateGarden(120, 55), [])
  const colors = COLORS[theme]

  return (
    <div className="bonsai-landing">
      <pre className="bonsai-pre">
        {grid.map((row, r) => (
          <span key={r}>
            {row.map((cell, c) => {
              if (cell.char === " ") return " "
              const palette = colors[cell.type]
              const color = palette[(r + c) % palette.length]
              return (
                <span key={c} style={{ color }}>{cell.char}</span>
              )
            })}
            {"\n"}
          </span>
        ))}
      </pre>
      <p className="bonsai-hint">select a file to get started</p>
    </div>
  )
}
