// @vitest-environment node
import {mkdtemp, readFile, readdir, rm} from "node:fs/promises"
import {fileURLToPath, pathToFileURL} from "node:url"
import {createRequire} from "node:module"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {build, createServer} from "vite"
import {expect, it, vi} from "vitest"

it("opens the lazy handwriting worker without discovering new dependencies or reloading", async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), "domeditor-handwriting-deps-"))
  const server = await createServer({
    cacheDir,
    logLevel: "silent",
    server: {middlewareMode: true, watch: null},
    // Reproduce a cold page crawl that cannot see inside the lazy worker.
    optimizeDeps: {entries: [], holdUntilCrawlEnd: false},
  })
  try {
    const optimizer = server.environments.client.depsOptimizer!
    await optimizer.scanProcessing
    await vi.waitFor(() => {
      expect(optimizer.metadata.optimized["onnxruntime-web/wasm"]).toBeDefined()
    }, {timeout: 20_000})
    const hash = optimizer.metadata.browserHash
    const send = vi.spyOn(server.ws, "send")
    const worker = await server.transformRequest("/src/math-handwriting-worker.ts")
    const ocr = await server.transformRequest("/src/math-handwriting-ocr.ts")
    expect(worker?.code).toContain("temml/dist/temml.mjs?")
    expect(worker?.code).not.toContain("/deps/temml.js")
    expect(ocr?.code).toContain("onnxruntime-web_wasm")
    expect(Object.keys(optimizer.metadata.discovered)).toEqual([])
    expect(optimizer.metadata.browserHash).toBe(hash)
    expect(send.mock.calls.some(([message]) => typeof message === "object" && message.type === "full-reload")).toBe(false)
  }
  finally {
    await server.close()
    await rm(cacheDir, {recursive: true, force: true})
  }
}, 30_000)

it("preserves the renderer's lexer and formula output in the production worker build", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "domeditor-handwriting-build-"))
  try {
    await build({
      configFile: false,
      publicDir: false,
      base: "./",
      logLevel: "silent",
      build: {
        outDir, assetsInlineLimit: 0,
        rollupOptions: {input: fileURLToPath(new URL("../src/math-handwriting.ts", import.meta.url))},
      },
    })
    const files = await readdir(join(outDir, "assets"))
    const rendererFile = files.find(file => /^temml-.*\.mjs$/.test(file))
    expect(rendererFile).toBeDefined()
    const rendererPath = join(outDir, "assets", rendererFile!)
    const original = createRequire(import.meta.url).resolve("temml/dist/temml.mjs")
    expect(await readFile(rendererPath, "utf8")).toBe(await readFile(original, "utf8"))
    const {default: renderer} = await import(pathToFileURL(rendererPath).href)
    const mathml = renderer.renderToString(String.raw`\sum_{n=1}\lambda+1`, {throwOnError: true, xml: true})
    expect(mathml).toContain(">∑</mo>")
    expect(mathml).toContain(">λ</mi>")
    expect(mathml).not.toContain("<mtext")
  }
  finally { await rm(outDir, {recursive: true, force: true}) }
}, 30_000)
