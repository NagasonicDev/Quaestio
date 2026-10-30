import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))

function requestLogging(): Plugin {
  return {
    name: 'quaestio-request-logging',
    configurePreviewServer(server) {
      const logFile = process.env.QB_SERVER_LOG || resolve(process.cwd(), '../logs/server.log')
      mkdirSync(dirname(logFile), { recursive: true })
      const write = (line: string) => {
        try {
          // Synchronous append keeps each completed request on disk immediately,
          // even when the launcher is stopped by closing its terminal.
          appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`, 'utf8')
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.error(`[quaestio] Could not write request log: ${message}`)
        }
      }

      write(`INFO server started at http://localhost:${server.config.preview.port || 4173}`)
      server.middlewares.use((req, res, next) => {
        const started = Date.now()
        res.once('finish', () => {
          write(`${res.statusCode >= 500 ? 'ERROR' : 'INFO'} ${req.method} ${req.url} ${res.statusCode} ${Date.now() - started}ms`)
        })
        res.once('close', () => {
          if (!res.writableFinished) write(`WARN ${req.method} ${req.url} connection closed before response completed`)
        })
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves this repository at a project path. Vercel and local
  // builds use the origin root unless a deployment explicitly sets a base.
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react(), requestLogging()],
  server: {
    // The course skill ZIP includes shared helper sources from ../scripts.
    fs: { allow: [repositoryRoot] },
  },
  optimizeDeps: {
    noDiscovery: true,
    exclude: ["sql.js"],
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react-router",
      "react-router-dom",
      "@tanstack/react-query",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-select",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
      "class-variance-authority",
      "clsx",
      "docx",
      "function-plot",
      "html-to-image",
      "html2canvas",
      "jspdf",
      "jszip",
      "katex",
      "lucide-react",
      "react-katex",
      "tailwind-merge",
    ],
  },
  build: {
    // The backend serves this build directly and already uses /assets/ for
    // uploaded question images/diagrams — rename Vite's own bundle output
    // directory so the two never collide.
    assetsDir: 'app-assets',
  },
})
