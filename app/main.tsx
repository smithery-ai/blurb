import { createRoot } from "react-dom/client"
import TaskView from "./TaskView"
import "sono-editor/styles"
import "./app.css"

function App() {
  const path = window.location.pathname.replace(/^\//, "").replace(/\/$/, "")

  if (!path || path.startsWith("api/")) {
    return (
      <div className="home">
        <h1>Sono</h1>
        <p>Share tasks with inline comments.</p>
      </div>
    )
  }

  const rest = path.replace(/^t\//, "")
  const slashIdx = rest.indexOf("/")
  const slug = slashIdx === -1 ? rest : rest.slice(0, slashIdx)
  const initialFile = slashIdx === -1 ? undefined : rest.slice(slashIdx + 1)
  return <TaskView slug={slug} initialFile={initialFile} />
}

createRoot(document.getElementById("root")!).render(<App />)
