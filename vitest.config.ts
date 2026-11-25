import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  esbuild: { jsx: 'automatic' },   // screens are .tsx; no React import needed in the files or the tests
  // Most tests are plain logic and run in Node. A screen test opts in to a browser-like page with "// @vitest-environment jsdom" on its first line.
  test: { include: ['tests/**/*.test.{ts,tsx}'], environment: 'node' },
})
