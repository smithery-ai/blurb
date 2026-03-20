import { useState, useCallback } from "react"

export default function ShareModal({ slug, title, description, onClose }: {
  slug: string
  title: string
  description?: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [exiting, setExiting] = useState(false)
  const url = `https://blurb.md/~/public/${slug}`
  const ogUrl = `/~/public/${slug}/og.svg`
  const desc = description?.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") || ""

  const handleClose = useCallback(() => {
    setExiting(true)
    setTimeout(onClose, 180)
  }, [onClose])

  const handleCopy = () => {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={`share-backdrop${exiting ? " share-exiting" : ""}`} onClick={handleClose}>
      <div className="share-modal" onClick={e => e.stopPropagation()}>
        <button className="share-close" onClick={handleClose}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
          </svg>
        </button>

        <div className="share-preview">
          <img src={ogUrl} alt={title} className="share-og-image" />
          <div className="share-meta">
            <span className="share-meta-domain">blurb.md</span>
            <span className="share-meta-title">{title}</span>
            {desc && <span className="share-meta-desc">{desc}</span>}
          </div>
        </div>

        <div className="share-url-row">
          <input className="share-url" value={url} readOnly onClick={e => (e.target as HTMLInputElement).select()} />
          <button className="share-copy" onClick={handleCopy}>
            {copied
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(130, 230, 130, 0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
