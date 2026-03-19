import { useState, useEffect, useCallback } from "react"
import { SonoEditor, FileTree } from "sono-editor"
import type { Anchor, Comment, TreeFile } from "sono-editor"
import { fetchTask, postComment, deleteComment, postReply } from "./api"

interface TaskFile {
  id: string
  path: string
  content: string
  language: string | null
  comments: Comment[]
}

interface Task {
  id: string
  slug: string
  title: string
  files: TaskFile[]
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

export default function TaskView({ slug, initialFile }: { slug: string; initialFile?: string }) {
  const [task, setTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activePath, setActivePath] = useState<string | null>(initialFile || null)
  const [theme, setTheme] = useState<"dark" | "light">("dark")
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const load = useCallback(async () => {
    const data = await fetchTask(slug) as any
    if (!data || data.error) {
      setError("Task not found")
    } else {
      setTask(data)
      // Auto-select first file if none selected (functional update avoids stale closure)
      if (!activePath && data.files.length > 0) navigate(data.files[0].path)
    }
    setLoading(false)
  }, [slug])

  useEffect(() => { load() }, [load])

  const navigate = useCallback((path: string) => {
    setActivePath(path)
    window.history.replaceState(null, "", `/t/${slug}/${path}`)
  }, [slug])

  // Sync page background with theme
  useEffect(() => {
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

  if (loading) return <div className="loading">Loading...</div>
  if (error || !task) return <div className="error">{error || "Not found"}</div>

  const file = task.files.find(f => f.path === activePath)
  const treeFiles: TreeFile[] = task.files.map(f => ({ id: f.id, path: f.path }))
  const showSidebar = task.files.length > 1

  const handleFileSelect = (tf: TreeFile) => {
    navigate(tf.path)
    setSidebarOpen(false)
  }

  const updateFileComments = (fileId: string, updater: (comments: Comment[]) => Comment[]) => {
    setTask(prev => {
      if (!prev) return prev
      return {
        ...prev,
        files: prev.files.map(f =>
          f.id === fileId ? { ...f, comments: updater(f.comments) } : f
        ),
      }
    })
  }

  const handleAddComment = async (anchor: Anchor, body: string) => {
    if (!file) return
    const tempId = `temp-${Date.now()}`
    updateFileComments(file.id, comments => [
      ...comments,
      { id: tempId, anchor, body, author: "You", createdAt: new Date().toISOString(), replies: [] },
    ])
    postComment(file.id, anchor, body)
  }

  const handleDeleteComment = async (commentId: string) => {
    if (!file) return
    updateFileComments(file.id, comments => comments.filter(c => c.id !== commentId))
    deleteComment(commentId)
  }

  const handleAddReply = async (commentId: string, body: string) => {
    if (!file) return
    const tempId = `temp-${Date.now()}`
    updateFileComments(file.id, comments =>
      comments.map(c =>
        c.id === commentId
          ? { ...c, replies: [...c.replies, { id: tempId, body, author: "You", createdAt: new Date().toISOString() }] }
          : c
      )
    )
    postReply(commentId, body)
  }

  const handleLinkClick = (href: string) => {
    // Resolve relative path against current file's directory
    const dir = activePath?.includes("/") ? activePath.replace(/\/[^/]+$/, "/") : ""
    const resolved = dir + href
    const match = task?.files.find(f => f.path === resolved || f.path === href)
    if (match) {
      navigate(match.path)
    }
  }

  return (
    <div className="task-view">
      {showSidebar && (
        <>
          <div className={`sidebar-backdrop ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />
          <div className={`task-sidebar ${sidebarOpen ? "open" : ""}`}>
            <FileTree
              files={treeFiles}
              activePath={activePath}
              title={task.title}
              theme={theme}
              onFileSelect={handleFileSelect}
            />
          </div>
        </>
      )}
      <div className="task-main">
        <header className="task-header">
          {showSidebar && (
            <button className="sidebar-toggle" onClick={() => setSidebarOpen(o => !o)} title="Toggle files">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M2 4h12M2 8h12M2 12h12" />
              </svg>
            </button>
          )}
          {!showSidebar && <h1>{task.title}</h1>}
          <div className="header-spacer" />
          <button
            className="theme-toggle"
            onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
            title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
        </header>
        <div className="editor-wrap">
          {file ? (
            <SonoEditor
              content={file.content}
              filename={file.path}
              comments={file.comments}
              readOnly={true}
              mode={/\.(md|mdx)$/i.test(file.path) ? "preview" : "source"}
              theme={theme}
              onAddComment={handleAddComment}
              onDeleteComment={handleDeleteComment}
              onAddReply={handleAddReply}
              onLinkClick={handleLinkClick}
            />
          ) : (
            <div className="error">Select a file</div>
          )}
        </div>
      </div>
    </div>
  )
}
