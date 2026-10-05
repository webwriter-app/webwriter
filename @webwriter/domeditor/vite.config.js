import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import {componentLicensesPlugin} from './scripts/component-licenses.mjs'

const localPackageWorkerSource = fileURLToPath(new URL('./src/local-package-service-worker.ts', import.meta.url))

function localPackageServiceWorkerPlugin() {
  return {
    name: 'local-package-service-worker-root',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const basePath = new URL(server.config.base, 'http://localhost').pathname.replace(/\/?$/, '/')
        const workerPath = `${basePath}local-package-service-worker.js`
        if (request.url?.split('?')[0] !== workerPath) {
          next()
          return
        }
        try {
          const transformed = await server.transformRequest('/src/local-package-service-worker.ts')
          if (!transformed) {
            next()
            return
          }
          response.statusCode = 200
          response.setHeader('Content-Type', 'application/javascript; charset=utf-8')
          response.setHeader('Service-Worker-Allowed', basePath)
          response.end(transformed.code)
        }
        catch {
          next()
        }
      })
    },
  }
}

export default defineConfig({
    plugins: [localPackageServiceWorkerPlugin(), componentLicensesPlugin(fileURLToPath(new URL('./package.json', import.meta.url)))],
    publicDir: "../../static",
    resolve: {
      dedupe: ["yjs"],
    },
    test: {
      execArgv: ["--max-old-space-size=8192"],
      // Vitest 4 restores spies without clearing their retained DOM call history.
      clearMocks: true,
      css: true,
      setupFiles: ["./tests/setup-happy-dom.mjs"],
      environmentOptions: {
        happyDOM: {
          settings: {
            disableCSSFileLoading: true,
            navigation: {disableChildFrameNavigation: true},
            disableJavaScriptFileLoading: true,
            handleDisabledFileLoadingAsSuccess: true,
          },
        },
      },
      // Happy DOM's CSS parsing and nested iframe tasks need headroom during
      // full runs; a CPU percentage still saturates machines with many cores.
      maxWorkers: 2,
      server: {
        deps: {
          inline: ["y-protocols", "y-websocket", "lib0"],
        },
      },
    },
    build: {
        emptyOutDir: true,
        chunkSizeWarningLimit: 1000,
        sourcemap: true,
        rollupOptions: {
          input: {
            index: fileURLToPath(new URL("./index.html", import.meta.url)),
            "frame-shell": fileURLToPath(new URL("./frame-shell.html", import.meta.url)),
            "editor-entry": fileURLToPath(new URL("./src/editor-entry.ts", import.meta.url)),
            "preview-entry": fileURLToPath(new URL("./src/preview-entry.ts", import.meta.url)),
            "local-package-service-worker": localPackageWorkerSource,
          },
          output: {
            entryFileNames: chunk => chunk.name === "local-package-service-worker"
              ? "local-package-service-worker.js"
              : "assets/[name].js",
          },
        },
    }
})
