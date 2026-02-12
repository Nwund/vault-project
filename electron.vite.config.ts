// @ts-nocheck
// File: electron.vite.config.ts
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // Native modules must stay external. Binary paths resolved at runtime.
        external: ['better-sqlite3', 'onnxruntime-node', 'sharp']
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
    },
    server: {
      port: 5173,
      strictPort: false // Auto-find next available port if 5173 is busy
    }
  }
})
