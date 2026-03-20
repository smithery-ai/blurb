import { useState, useEffect, useCallback } from "react"
import { Editor, FileTree, useFileTreeStore, getDefaultWidgets } from "engei"
import type { Anchor, Comment, TreeFile } from "engei"

const widgets = getDefaultWidgets()
import { fetchFolder, postComment, deleteComment, postReply } from "./api"

interface FolderFile {
  id: string
  path: string
  content: string
  language: string | null
  comments: Comment[]
}

interface Folder {
  id: string
  slug: string
  title: string
  files: FolderFile[]
}

const SunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
    <circle cx="8" cy="8" r="3" />
    <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.75 3.75l1.06 1.06M11.19 11.19l1.06 1.06M12.25 3.75l-1.06 1.06M4.81 11.19l-1.06 1.06" />
  </svg>
)

const MoonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13.5 8.5a5.5 5.5 0 01-7-7 5.5 5.5 0 107 7z" />
  </svg>
)

const CopyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
)

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
)

export default function FolderView({ slug, initialFile, landing }: { slug: string; initialFile?: string; landing?: (theme: "dark" | "light") => React.ReactNode }) {
  const [folder, setFolder] = useState<Folder | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activePath, setActivePath] = useState<string | null>(initialFile || null)
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const stored = localStorage.getItem("blurb-theme")
    if (stored === "dark" || stored === "light") return stored
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"
  })
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 640)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    const data = await fetchFolder(slug) as any
    if (!data || data.error) {
      setError("Folder not found")
    } else {
      setFolder(data)
      // Auto-select first file if none selected (skip when landing page is shown)
      if (!landing && !activePath && data.files.length > 0) navigate(data.files[0].path)
    }
    setLoading(false)
  }, [slug])

  useEffect(() => { load() }, [load])

  const navigate = useCallback((path: string) => {
    setActivePath(path)
    window.history.replaceState(null, "", `/~/public/${slug}/${path}`)
  }, [slug])

  // Persist theme choice and sync CSS variables
  useEffect(() => {
    localStorage.setItem("blurb-theme", theme)
    const root = document.documentElement
    if (theme === "dark") {
      root.style.setProperty("--editor-bg", "#1a1816")
      root.style.setProperty("--editor-fg", "#e8e6e3")
      root.style.setProperty("--widget-border", "#3a3530")
      root.style.setProperty("--sidebar-bg", "#1a1816")
    } else {
      root.style.setProperty("--editor-bg", "#faf8f5")
      root.style.setProperty("--editor-fg", "#2a2520")
      root.style.setProperty("--widget-border", "#d8d0c8")
      root.style.setProperty("--sidebar-bg", "#faf8f5")
    }
    root.style.background = root.style.getPropertyValue("--editor-bg")
    root.style.color = root.style.getPropertyValue("--editor-fg")
  }, [theme])

  // Listen for OS theme changes (only applies when no explicit choice stored)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)")
    const handler = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem("blurb-theme")) {
        setTheme(e.matches ? "light" : "dark")
      }
    }
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])

  if (loading) return <div className="loading">Loading...</div>
  if (error || !folder) return <div className="error">{error || "Not found"}</div>

  const file = folder.files.find(f => f.path === activePath)
  const treeFiles: TreeFile[] = folder.files.map(f => ({ id: f.id, path: f.path }))
  const showSidebar = true

  // Breadcrumb: ~/public/{slug}/{filePath}
  // Each segment has a label and optional nav target (path to navigate to)
  // ~ and public are inert; slug navigates to first file; path segments navigate into dirs
  const breadcrumb = (() => {
    if (!activePath) return null
    const pathParts = activePath.split("/")
    // Build full segments with nav targets
    const all: { label: string; nav?: string }[] = [
      { label: "~" },
      { label: "public" },
      { label: slug, nav: folder.files[0]?.path },
    ]
    // Add directory segments — clicking navigates to first file under that prefix
    for (let i = 0; i < pathParts.length - 1; i++) {
      const prefix = pathParts.slice(0, i + 1).join("/") + "/"
      const first = folder.files.find(f => f.path.startsWith(prefix))
      all.push({ label: pathParts[i], nav: first?.path })
    }
    // Add the filename (current file — no nav needed)
    all.push({ label: pathParts[pathParts.length - 1] })

    // Collapse middle to "…" if longer than 4 segments
    if (all.length <= 4) return all
    return [all[0], { label: "…" }, all[all.length - 2], all[all.length - 1]]
  })()

  const handleFileSelect = (tf: TreeFile) => {
    navigate(tf.path)
    if (window.innerWidth <= 640) setSidebarOpen(false)
  }

  const updateFileComments = (fileId: string, updater: (comments: Comment[]) => Comment[]) => {
    setFolder(prev => {
      if (!prev) return prev
      return {
        ...prev,
        files: prev.files.map(f =>
          f.id === fileId ? { ...f, comments: updater(f.comments) } : f
        ),
      }
    })
  }

  const handleCreateComment = async (anchor: Anchor, body?: string) => {
    if (!file) return
    const tempId = `temp-${Date.now()}`
    updateFileComments(file.id, comments => [
      ...comments,
      { id: tempId, anchor, body: body || "", author: "You", createdAt: new Date().toISOString(), replies: [] },
    ])
    if (body) {
      // Preview path: anchor+body submitted together — persist immediately
      const result = await postComment(slug, file.path, anchor, body)
      if (result.ok) {
        updateFileComments(file.id, comments =>
          comments.map(c => c.id === tempId ? { ...c, id: result.data.id } : c)
        )
      } else {
        updateFileComments(file.id, comments => comments.filter(c => c.id !== tempId))
      }
    }
    // If no body, this is a draft — will be persisted when handleUpdateComment is called.
  }

  const handleUpdateComment = async (commentId: string, body: string) => {
    if (!file) return
    const comment = file.comments.find(c => c.id === commentId)
    if (!comment) return
    // Optimistic: show the body immediately
    updateFileComments(file.id, comments =>
      comments.map(c => c.id === commentId ? { ...c, body } : c)
    )
    // Create on server and swap temp ID with real ID
    const result = await postComment(slug, file.path, comment.anchor, body)
    if (result.ok) {
      updateFileComments(file.id, comments =>
        comments.map(c => c.id === commentId ? { ...c, id: result.data.id } : c)
      )
    } else {
      // Rollback: remove the comment on failure
      updateFileComments(file.id, comments => comments.filter(c => c.id !== commentId))
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    if (!file) return
    // Save for rollback
    const prevComments = file.comments
    updateFileComments(file.id, comments => comments.filter(c => c.id !== commentId))
    // Only call server if it's a persisted comment (not a local draft)
    if (!commentId.startsWith("temp-")) {
      const result = await deleteComment(slug, file.path, commentId)
      if (!result.ok) {
        // Rollback on failure
        updateFileComments(file.id, () => prevComments)
      }
    }
  }

  const handleAddReply = async (commentId: string, body: string) => {
    if (!file) return
    const tempId = `temp-${Date.now()}`
    // Optimistic: show reply immediately
    updateFileComments(file.id, comments =>
      comments.map(c =>
        c.id === commentId
          ? { ...c, replies: [...c.replies, { id: tempId, body, author: "You", createdAt: new Date().toISOString() }] }
          : c
      )
    )
    const result = await postReply(slug, file.path, commentId, body)
    if (result.ok) {
      // Swap temp reply ID with real ID
      updateFileComments(file.id, comments =>
        comments.map(c =>
          c.id === commentId
            ? { ...c, replies: c.replies.map(r => r.id === tempId ? { ...r, id: result.data.id } : r) }
            : c
        )
      )
    } else {
      // Rollback: remove the temp reply
      updateFileComments(file.id, comments =>
        comments.map(c =>
          c.id === commentId
            ? { ...c, replies: c.replies.filter(r => r.id !== tempId) }
            : c
        )
      )
    }
  }

  const handleLinkClick = (href: string) => {
    const dir = activePath?.includes("/") ? activePath.replace(/\/[^/]+$/, "/") : ""
    const resolved = dir + href
    const match = folder?.files.find(f => f.path === resolved || f.path === href)
    if (match) {
      navigate(match.path)
    }
  }

  return (
    <div className={`folder-view${!showSidebar ? " no-sidebar" : ""}${showSidebar && !sidebarOpen ? " sidebar-collapsed" : ""}`}>
      {showSidebar && (
        <>
          <div className={`sidebar-backdrop ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />
          <div className={`folder-sidebar ${sidebarOpen ? "open" : ""}`}>
            <div className="sidebar-header">
              <div className="header-spacer" />
              <button className="sidebar-action" onClick={() => useFileTreeStore.getState().collapseAll()} title="Collapse all folders">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m7 20 5-5 5 5" /><path d="m7 4 5 5 5-5" />
                </svg>
              </button>
              <button className="sidebar-action" onClick={() => setSidebarOpen(false)} title="Collapse sidebar">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 8H4M4 8l4-4M4 8l4 4" />
                </svg>
              </button>
            </div>
            <FileTree
              files={treeFiles}
              activePath={activePath}
              rootName={slug}
              theme={theme}
              onFileSelect={handleFileSelect}
            />
          </div>
        </>
      )}
      <div className="folder-main">
        <header className="folder-header">
          {showSidebar && (
            <button className={`sidebar-toggle ${sidebarOpen ? 'hidden' : ''}`} onClick={() => setSidebarOpen(true)}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M2 4h12M2 8h12M2 12h12" />
              </svg>
            </button>
          )}
          {breadcrumb && (
            <nav className="breadcrumb">
              {breadcrumb.map((seg, i) => (
                <span key={i}>
                  {i > 0 && <span className="breadcrumb-sep">/</span>}
                  {seg.nav ? (
                    <a className="breadcrumb-link" onClick={() => navigate(seg.nav!)}>{seg.label}</a>
                  ) : (
                    <span>{seg.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
          <div className="header-spacer" />
          {file && (
            <button
              className="theme-toggle"
              onClick={() => {
                navigator.clipboard.writeText(file.content)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </button>
          )}
          <button
            className="theme-toggle"
            onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
        </header>
        <div className="editor-wrap">
          {file ? (
            <Editor
              content={file.content}
              filename={file.path}
              comments={file.comments}
              readOnly={true}
              mode={/\.(md|mdx)$/i.test(file.path) ? "preview" : "source"}
              theme={theme}
              widgets={widgets}
              onCreateComment={handleCreateComment}
              onUpdateComment={handleUpdateComment}
              onDeleteComment={handleDeleteComment}
              onAddReply={handleAddReply}
              onLinkClick={handleLinkClick}
            />
          ) : landing ? (
            landing(theme)
          ) : (
            <div className="error">Select a file</div>
          )}
        </div>
      </div>
    </div>
  )
}
