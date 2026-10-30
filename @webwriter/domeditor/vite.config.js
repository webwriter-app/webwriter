import { fileURLToPath } from 'url'
import {existsSync, realpathSync} from 'node:fs'
import {resolve} from 'node:path'
import { defineConfig, loadEnv, normalizePath } from 'vite'
import {componentLicensesPlugin} from './scripts/component-licenses.mjs'
import {referenceFormatterPlugin} from './scripts/reference-formatter-plugin.mjs'
import {distributionReaderPlugin} from './scripts/distribution-reader-plugin.mjs'
import {documentationPlugin} from './scripts/documentation-plugin.mjs'
import {siteHeaderPlugin} from './scripts/site-header.mjs'

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

export default defineConfig(({mode}) => {
  const root = fileURLToPath(new URL('.', import.meta.url))
  const configuredDataDirectory = loadEnv(mode, root, 'WEBWRITER_DEV_DATA_DIR').WEBWRITER_DEV_DATA_DIR
  const privateDirectories = configuredDataDirectory ? [resolve(root, configuredDataDirectory)] : []
  for(const directory of [...privateDirectories]) if(existsSync(directory)) privateDirectories.push(realpathSync(directory))
  const privatePaths = [...new Set(privateDirectories)].map(path => `${normalizePath(path).replace(/[?*\[\]{}()!+@]/g, "\\$&")}/**`)
  return {
    plugins: [siteHeaderPlugin(), documentationPlugin(), localPackageServiceWorkerPlugin(), componentLicensesPlugin(fileURLToPath(new URL('./package.json', import.meta.url))),
      referenceFormatterPlugin(fileURLToPath(new URL('./src/reference-format.ts', import.meta.url))), distributionReaderPlugin()],
    appType: "mpa",
    server: {
      // Preserve Vite's default secret-file exclusions and protect the backend
      // data even when running the standalone frontend development server.
      fs: {deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.webwriter-dev/**", ...privatePaths]},
    },
    publicDir: "../../static",
    resolve: {
      dedupe: ["yjs"],
    },
    optimizeDeps: {
      // Lazy review modules and workers can be outside the initial dependency crawl.
      // Discovering these on first use would re-optimize dependencies and reload the page.
      include: ["onnxruntime-web/wasm", "axe-core"],
    },
    test: {
      coverage: {
        provider: "v8",
        include: ["src/**/*.ts"],
        exclude: ["src/**/*.test.ts", "src/**/*.d.ts"],
        reporter: ["text", "html", "json", "json-summary"],
        reportsDirectory: "./coverage",
        thresholds: {
          statements: 87.18,
          branches: 81.75,
          functions: 89.5,
          lines: 90.85,
        },
      },
      execArgv: ["--max-old-space-size=8192"],
      // DOM-heavy integration cases can pause for CSS parsing and GC in full runs.
      testTimeout: 10_000,
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
            gallery: fileURLToPath(new URL("./gallery/index.html", import.meta.url)),
            examples: fileURLToPath(new URL("./examples/index.html", import.meta.url)),
            "legal-notice": fileURLToPath(new URL("./legal_notice/index.html", import.meta.url)),
            "site-entry": fileURLToPath(new URL("./src/site-entry.ts", import.meta.url)),
            "gallery-preview-entry": fileURLToPath(new URL("./src/gallery-preview-entry.ts", import.meta.url)),
            editor: fileURLToPath(new URL("./editor/index.html", import.meta.url)),
            live: fileURLToPath(new URL("./live/index.html", import.meta.url)),
            "docs-preview": fileURLToPath(new URL("./docs/widgets/examples/preview.html", import.meta.url)),
            "docs-hello": fileURLToPath(new URL("./docs/widgets/examples/hello.html", import.meta.url)),
            "frame-shell": fileURLToPath(new URL("./frame-shell.html", import.meta.url)),
            "editor-entry": fileURLToPath(new URL("./src/editor-entry.ts", import.meta.url)),
            "preview-entry": fileURLToPath(new URL("./src/preview-entry.ts", import.meta.url)),
            "live-learner-entry": fileURLToPath(new URL("./src/live-learner-entry.ts", import.meta.url)),
            "local-package-service-worker": localPackageWorkerSource,
          },
          output: {
            entryFileNames: chunk => chunk.name === "local-package-service-worker"
              ? "local-package-service-worker.js"
              : "assets/[name].js",
          },
        },
    }
  }
})
