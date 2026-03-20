import { useMemo, useRef, useState, useCallback } from "react"

// ASCII garden fern — multiple Barnsley fern fronds fanning from a center
// Like a snapshot of a potted fern plant (engei = 園芸 = gardening)
// Seeded from file content hash so same files = same fern

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

// Mulberry32 seeded PRNG
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

// Simple string hash → 32-bit integer
export function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0
  }
  return h
}

// Seeded random helpers
function makeRand(rng: () => number) {
  return (min: number, max: number) => min + rng() * (max - min)
}

interface Frond {
  angle: number    // rotation in radians
  scale: number    // size multiplier
  ox: number       // origin offset X (in fern-space)
  oy: number       // origin offset Y
  iters: number    // iterations for this frond
}

function generateGarden(cols: number, rows: number, seed: number): Cell[][] {
  const rng = mulberry32(seed)
  const rand = makeRand(rng)

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
    stem:  ["#4a3315", "#3a2305", "#5a4325"],
    frond: ["#1a5a0a", "#2a6a1a", "#0a4a00", "#1a5510"],
    tip:   ["#2a7a1a", "#3a8a2a", "#1a6a0a", "#2a7520"],
  },
}

export default function Fern({ theme, seed = 0, title, description }: { theme: "dark" | "light"; seed?: number; title?: string; description?: string }) {
  const grid = useMemo(() => generateGarden(120, 55, seed), [seed])
  const colors = COLORS[theme]
  const preRef = useRef<HTMLPreElement>(null)
  const [mouse, setMouse] = useState<{ col: number; row: number } | null>(null)

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const el = preRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    // Estimate char size from element dimensions
    const charW = rect.width / 120
    const charH = rect.height / 55
    setMouse({ col: x / charW, row: y / charH })
  }, [])

  const handleMouseLeave = useCallback(() => setMouse(null), [])

  const RADIUS_X = 12 // wider horizontal spread
  const RADIUS_Y = 6  // shorter vertical

  // Stable per-cell noise from position (no re-randomizing)
  const noise = useCallback((r: number, c: number) => {
    const h = Math.sin(r * 127.1 + c * 311.7) * 43758.5453
    return h - Math.floor(h) // 0..1
  }, [])

  return (
    <div className={`fern-landing${title ? " fern-with-title" : ""}`}>
      {title && (
        <div className="fern-info">
          <h1 className="fern-title">{title}</h1>
          {description && <p className="fern-description">{description}</p>}
        </div>
      )}
      <div className="fern-plant">
      <pre className="fern-pre" ref={preRef} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
        {grid.map((row, r) => (
          <span key={r}>
            {row.map((cell, c) => {
              if (cell.char === " ") return " "
              const palette = colors[cell.type]
              const baseColor = palette[(r + c) % palette.length]

              let pushY = 0
              if (mouse) {
                const dx = (c - mouse.col) / RADIUS_X
                const dy = (r - mouse.row) / RADIUS_Y
                const dist = Math.sqrt(dx * dx + dy * dy)
                const jitter = noise(r, c) * 0.2
                if (dist + jitter < 1) {
                  const t = 1 - (dist + jitter)
                  // Gaussian-ish push: strongest at center, curved falloff
                  const strength = t * t * (3 - 2 * t)
                  // Push down, slightly outward from center
                  const dirY = r >= mouse.row ? 1 : 0.3 // mostly downward
                  pushY = strength * 8 * dirY
                }
              }

              const style: React.CSSProperties = pushY
                ? { color: baseColor, display: "inline-block", transform: `translateY(${pushY}px)`, transition: "transform 0.15s ease-out" }
                : { color: baseColor }

              return (
                <span key={c} style={style}>{cell.char}</span>
              )
            })}
            {"\n"}
          </span>
        ))}
      </pre>
      <p className="fern-hash">[#{(seed >>> 0).toString(16).padStart(8, "0")}]</p>
      </div>
    </div>
  )
}
