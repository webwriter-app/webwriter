import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'


export default defineConfig({
    publicDir: "../../static",
    build: {
        emptyOutDir: true,
        chunkSizeWarningLimit: 1000,
        sourcemap: true,
        rollupOptions: {
          input: {
            index: fileURLToPath(new URL("./index.html", import.meta.url)),
          },
        },
    }
})