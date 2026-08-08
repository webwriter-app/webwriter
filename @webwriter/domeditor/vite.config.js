import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'


export default defineConfig({
    publicDir: "../../static",
    test: {
      css: true,
    },
    build: {
        emptyOutDir: true,
        chunkSizeWarningLimit: 1000,
        sourcemap: true,
        rollupOptions: {
          input: {
            index: fileURLToPath(new URL("./index.html", import.meta.url)),
            "editor-entry": fileURLToPath(new URL("./src/editor-entry.ts", import.meta.url)),
          },
          output: {
            entryFileNames: "assets/[name].js",
          },
        },
    }
})
