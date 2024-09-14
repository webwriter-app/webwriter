import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import { lezer } from '@lezer/generator/rollup'
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
    publicDir: "../../static",
    build: {
        emptyOutDir: true,
        chunkSizeWarningLimit: 1000,
        sourcemap: true,
        rollupOptions: {
          input: {
            app: fileURLToPath(new URL("./index.html", import.meta.url)),
            settings: fileURLToPath(new URL("./settings.html", import.meta.url)),
            worker: fileURLToPath(new URL("./viewmodel/services/bundleservice.ts", import.meta.url))
          },
        }
    },
    plugins: [
      lezer({exportName: "parser"}),
      VitePWA({
        srcDir: "./viewmodel/services",
        filename: "bundleservice.ts",
        strategies: "injectManifest",
        injectRegister: false,
        manifest: false,
        injectManifest: {
          injectionPoint: undefined,
          rollupOptions: {
            external: ["@babel/core", "@babel/plugin-syntax-import-attributes","@babel/preset-typescript"]
          }
        },
        devOptions: {
          enabled: true
        }
      })
    ]
})