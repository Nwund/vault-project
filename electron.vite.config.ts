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
    // #325 — React Compiler 1.0. Now active on React 19+. compilationMode
    // 'annotation' = opt-in per component via `'use memo'` directive,
    // so existing components aren't compiled unless we ask. Switch to
    // 'all' once we've audited for compiler-incompat patterns.
    plugins: [react({
      babel: {
        plugins: [['babel-plugin-react-compiler', { compilationMode: 'annotation' }]],
      },
    })],
    resolve: {
      alias: {
        '@renderer': path.resolve('src/renderer')
      }
    },
    server: {
      port: 5173,
      // strictPort: true — fail loudly if 5173 is busy instead of silently
      // falling back to 5174. The main process hardcodes 5173 (via
      // DEFAULT_DEV_SERVER_URL + dev.mjs preset), so a port mismatch leaves
      // electron pointed at a dead URL — symptom: blank tabs across the
      // whole app, no obvious error in the console.
      strictPort: true
    },
    build: {
      rollupOptions: {
        // Silence "Module level directives cause errors when bundled" for
        // 'use memo' — the React Compiler reads + processes the directive
        // at babel-transform time; rollup sees the residual string and
        // warns. The warning is benign; the compiler has already done its
        // memoization work by the time rollup runs.
        onwarn(warning, warn) {
          if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && /['"]use memo['"]/.test(warning.message ?? '')) return
          warn(warning)
        }
      }
    }
  }
})
