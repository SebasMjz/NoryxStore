/*
Note this config is used in build time only. For development server src/tools/dev.mjs
*/

import { defineConfig } from 'astro/config'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

function contentTypeForExt(ext) {
  const map = {
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.map': 'application/json'
  }
  return map[ext] || 'application/octet-stream'
}

/** En `astro dev`: /assets/* → src/assets; /dist/* → dist; favicon en raíz desde dist. */
function devStaticServePlugin() {
  return {
    name: 'noryx-dev-static-serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        try {
          const raw = req.url?.split('?')[0] || ''
          const url = decodeURIComponent(raw)

          if (url.startsWith('/assets/')) {
            const rel = url.slice('/assets/'.length).replace(/^(\.\.(\/|\\|$))+/, '')
            const base = path.resolve(projectRoot, 'src', 'assets')
            const fp = path.resolve(base, rel)
            if (!fp.startsWith(base)) return next()
            if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) return next()
            res.setHeader('Content-Type', contentTypeForExt(path.extname(fp).toLowerCase()))
            const stream = fs.createReadStream(fp)
            stream.on('error', () => next())
            stream.pipe(res)
            return
          }

          if (url.startsWith('/dist/')) {
            const rel = url.slice('/dist/'.length).replace(/^(\.\.(\/|\\|$))+/, '')
            const base = path.resolve(projectRoot, 'dist')
            const fp = path.resolve(base, rel)
            if (!fp.startsWith(base)) return next()
            if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) return next()
            res.setHeader('Content-Type', contentTypeForExt(path.extname(fp).toLowerCase()))
            const stream = fs.createReadStream(fp)
            stream.on('error', () => next())
            stream.pipe(res)
            return
          }

          const rootStatics = new Set([
            'favicon.ico',
            'icon.svg',
            'apple-touch-icon.png',
            'manifest.webmanifest'
          ])
          const clean = url.startsWith('/') ? url.slice(1) : url
          if (rootStatics.has(clean)) {
            const fp = path.join(projectRoot, 'dist', clean)
            if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) return next()
            res.setHeader('Content-Type', contentTypeForExt(path.extname(fp).toLowerCase()))
            fs.createReadStream(fp).on('error', () => next()).pipe(res)
            return
          }
        } catch {
          /* seguir */
        }
        next()
      })
    }
  }
}

// Custom Vite plugin to watch for asset changes and trigger HMR
const assetHmrPlugin = () => {
  return {
    name: 'asset-hmr-plugin',
    configureServer(server) {
      // Watch for changes in the dist directory
      const watcher = server.watcher

      // Add dist directory to the watcher
      watcher.add(path.resolve('./dist'))

      // Watch for the reload trigger files
      watcher.on('change', (filePath) => {
        if (filePath.includes('.reload-trigger') || filePath.includes('reload-')) {
          // Force reload all clients
          server.ws.send({ type: 'full-reload' })
        }
      })

      // Watch for asset changes
      watcher.on('add', (filePath) => {
        if (filePath.startsWith(path.resolve('./dist'))) {
          // Force reload all clients
          server.ws.send({ type: 'full-reload' })
        }
      })
    }
  }
}

// https://astro.build/config
export default defineConfig({
  devToolbar: { enabled: false }, // Disable the dev toolbar
  build: {
    // Example: Generate `page.html` instead of `page/index.html` during build.
    format: 'file'
  },

  srcDir: './src/html',
  cacheDir: './.cache/astro',
  outDir: './dist',
  trailingSlash: 'never',

  vite: {
    plugins: [devStaticServePlugin(), assetHmrPlugin()],
    build: {
      emptyOutDir: false
    },
    css: {
      preprocessorOptions: {
        scss: {
          quietDeps: true
        }
      }
    },
    server: {
      watch: {
        // Include dist folder and ensure assets are watched
        ignored: ['!**/dist/**'],
        // Add additional files/directories to watch
        additionalPaths: ['src/assets/**/*', 'dist/**/*']
      },
      // Simplified HMR configuration to avoid WebSocket errors
      hmr: true
    }
  }
})
