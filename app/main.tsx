import { createRoot } from "react-dom/client"
import FolderView from "./FolderView"
import "engei/styles"
import "./app.css"

function App() {
  const path = window.location.pathname.replace(/^\//, "").replace(/\/$/, "")

  if (!path || !path.startsWith("~/public/")) {
    return (
      <div className="home">
        <h1>Sono</h1>
        <p>Share folders with inline comments.</p>
      </div>
    )
  }

  const rest = path.replace(/^~\/public\//, "")
  const slashIdx = rest.indexOf("/")
  const slug = slashIdx === -1 ? rest : rest.slice(0, slashIdx)
  const initialFile = slashIdx === -1 ? undefined : rest.slice(slashIdx + 1)
  return <FolderView slug={slug} initialFile={initialFile} />
}

createRoot(document.getElementById("root")!).render(<App />)
