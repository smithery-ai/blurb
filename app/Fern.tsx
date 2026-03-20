import { useMemo, useRef, useState, useCallback } from "react"
import { generateGarden, COLORS } from "../lib/fern-core"

export { hashStr } from "../lib/fern-core"

export default function Fern({ theme, seed = 0, title, description, command }: { theme: "dark" | "light"; seed?: number; title?: string; description?: string; command?: string }) {
  const grid = useMemo(() => generateGarden(120, 55, seed), [seed])
  const colors = COLORS[theme]
  const preRef = useRef<HTMLPreElement>(null)
  const [mouse, setMouse] = useState<{ col: number; row: number } | null>(null)
  const [copied, setCopied] = useState(false)
  const [clicked, setClicked] = useState(false)

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const el = preRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const charW = rect.width / 120
    const charH = rect.height / 55
    setMouse({ col: x / charW, row: y / charH })
  }, [])

  const handleMouseLeave = useCallback(() => setMouse(null), [])

  const RADIUS_X = 12
  const RADIUS_Y = 6

  const noise = useCallback((r: number, c: number) => {
    const h = Math.sin(r * 127.1 + c * 311.7) * 43758.5453
    return h - Math.floor(h)
  }, [])

  return (
    <div className={`fern-landing${title ? " fern-with-title" : ""}`}>
      {title && (
        <div className="fern-info">
          <h1 className="fern-title">{title}</h1>
          {description && <p className="fern-description" dangerouslySetInnerHTML={{ __html: description.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>') }} />}
          {command && <pre className={`fern-codeblock${clicked ? " fern-cb-clicked" : ""}`} onClick={() => { navigator.clipboard.writeText(command); setCopied(true); setClicked(true); setTimeout(() => setCopied(false), 4000); setTimeout(() => setClicked(false), 300) }}>
            <code>{command}</code>
            <span className="fern-cb-copy">{copied
              ? <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(130, 230, 130, 0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              : <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            }</span>
          </pre>}
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
                  const strength = t * t * (3 - 2 * t)
                  const dirY = r >= mouse.row ? 1 : 0.3
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
      <p className="fern-footer">forged with ♥ by smithery</p>
    </div>
  )
}
