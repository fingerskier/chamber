import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30000,
    // DB-backed tests share tables; keep them serial.
    fileParallelism: false,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
})
