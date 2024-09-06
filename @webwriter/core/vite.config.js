import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import { lezer } from '@lezer/generator/rollup'
import {VitePWA} from "vite-plugin-pwa"

export default defineConfig({
    publicDir: "../../static",
    build: {
        emptyOutDir: true,
        chunkSizeWarningLimit: 1000,
        sourcemap: true,
        rollupOptions: {
          input: {
            app: fileURLToPath(new URL("./index.html", import.meta.url)),
            settings: fileURLToPath(new URL("./settings.html", import.meta.url))
          }
        }
    },
    resolve: {
      alias: {find: "@babel/core", replacement: "@babel/standalone"}
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
          injectionPoint: undefined
        },
        devOptions: {
          enabled: true
        }
      })
    ]
})