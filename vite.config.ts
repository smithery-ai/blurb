import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  root: "app",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/codemirror") ||
              id.includes("node_modules/@codemirror/") ||
              id.includes("node_modules/@lezer/")) {
            return "codemirror"
          }
        },
      },
    },
  },
})
