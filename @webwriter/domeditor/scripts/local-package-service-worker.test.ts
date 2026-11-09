// @vitest-environment node
import {ImportType, init, parse} from "es-module-lexer"
import {build} from "vite"
import {expect, it, vi} from "vitest"

it("builds a standalone service worker at the stable URL with the configured base", async () => {
  const result = await build({
    base: "/nested/", logLevel: "silent",
    build: {write: false, reportCompressedSize: false},
  })
  if(Array.isArray(result) || !("output" in result)) throw new Error("Expected a single build output")
  const worker = result.output.find(item => item.fileName === "local-package-service-worker.js")
  if(!worker) throw new Error("Missing service worker at the build root")
  const output = worker.type === "chunk" ? worker.code : worker.source
  const source = typeof output === "string" ? output : new TextDecoder().decode(output)
  await init
  expect(parse(source)[0].filter(entry => entry.t !== ImportType.ImportMeta)).toEqual([])

  const addEventListener = vi.fn()
  vi.stubGlobal("addEventListener", addEventListener)
  vi.stubGlobal("location", new URL("https://editor.example/nested/local-package-service-worker.js"))
  vi.stubGlobal("indexedDB", undefined)
  try {
    await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
    const onFetch = addEventListener.mock.calls.find(([type]) => type === "fetch")?.[1]
    expect(onFetch).toBeTypeOf("function")
    const respondWith = vi.fn()
    onFetch({request: new Request("https://editor.example/nested/__webwriter/local-packages/demo/index.js"), respondWith})
    expect(await respondWith.mock.calls[0][0]).toMatchObject({status: 503})
    respondWith.mockClear()
    onFetch({request: new Request("https://editor.example/__webwriter/local-packages/demo/index.js"), respondWith})
    expect(respondWith).not.toHaveBeenCalled()
  }
  finally { vi.unstubAllGlobals() }
}, 30_000)
