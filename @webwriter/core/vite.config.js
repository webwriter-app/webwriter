import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import { lezer } from '@lezer/generator/rollup'

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
    plugins: [lezer({exportName: "parser"})]
})