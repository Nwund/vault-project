// @ts-nocheck
// File: electron.vite.config.ts
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // Native modules MUST stay external so their .node binaries load correctly.
        external: ['better-sqlite3']
      }
    },
    resolve: {
      alias: {
        '@main': path.resolve('src/main')
      }
    }
  },

  preload: {
    build: {
      rollupOptions: {
        output: {
          // Electron expects preload as CJS in most setups; also matches "index.js" path.
          format: 'cjs',
          entryFileNames: 'index.js',
          chunkFileNames: 'chunks/[name].js',
          assetFileNames: 'assets/[name].[ext]'
        }
      }
    },
    resolve: {
      alias: {
        '@preload': path.resolve('src/preload')
      }
    }
  },

  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@renderer': path.resolve('src/renderer')
      }
    }
  }
})
