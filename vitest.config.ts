import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// Test config separato da electron.vite.config.ts: i moduli sotto test sono
// TypeScript puro (geometria/curve/misure/serializzazione), nessuna
// dipendenza da Electron o dal DOM tranne serialization.ts (localStorage),
// per cui basta l'ambiente 'jsdom'.
export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src')
    }
  },
  test: {
    environment: 'jsdom',
    include: ['src/renderer/src/core/**/*.test.ts']
  }
})
