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
            app: fileURLToPath(new URL("./view/app/index.html", import.meta.url)),
            settings: fileURLToPath(new URL("./settings.html", import.meta.url)),
            worker: fileURLToPath(new URL("./viewmodel/apicontroller/index.service.ts", import.meta.url))
          },
        },
    },
    esbuild: {
      dropLabels: ["DEV"]
    },
    plugins: [
      lezer({exportName: "parser"}),
      VitePWA({
        srcDir: "./viewmodel/apicontroller",
        filename: "index.service.ts",
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