import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  resolve: {
    alias: {
      "cloudflare:workers": path.resolve(__dirname, "src/__tests__/cf-workers-stub.ts"),
    },
  },
  test: {
    include: ["src/__tests__/**/*.test.ts"],
  },
})
