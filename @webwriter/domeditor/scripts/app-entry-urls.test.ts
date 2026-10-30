// @vitest-environment node
import {mkdtemp, mkdir, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {build} from "vite"
import {expect, it} from "vitest"
import {appEntryUrlsPlugin} from "./app-entry-urls.mjs"

const names = ["editor-entry", "preview-entry", "live-learner-entry", "gallery-preview-entry"]

it("uses source URLs under the configured base during development", () => {
  const plugin = appEntryUrlsPlugin()
  plugin.configResolved({command: "serve", base: "/nested/"})
  for(const name of names) {
    const id = plugin.resolveId(`virtual:app-entry/${name}`)
    expect(plugin.load(id)).toBe(`export default "/nested/src/${name}.ts"`)
  }
  expect(plugin.resolveId("virtual:app-entry/unknown")).toBeUndefined()
})

it("emits executable hashed frame entries and updates their callers when dependencies change", async () => {
  const root = await mkdtemp(join(tmpdir(), "domeditor-entry-urls-"))
  try {
    await mkdir(join(root, "src"))
    await writeFile(join(root, "src/shared.ts"), 'export const revision = "first"')
    for(const name of names) {
      await writeFile(join(root, `src/${name}.ts`),
        `import {revision} from "./shared"; globalThis[${JSON.stringify(name)}] = revision`)
    }
    await writeFile(join(root, "src/host.ts"), names.map((name, index) =>
      `import url${index} from "virtual:app-entry/${name}"`,
    ).join("\n") + `\nexport default [${names.map((_, index) => `url${index}`).join(",")}]`)
    const compile = async () => {
      const result = await build({
        configFile: false, root, publicDir: false, base: "/nested/", logLevel: "silent",
        plugins: [appEntryUrlsPlugin()],
        build: {write: false, minify: false, rollupOptions: {
          input: {host: join(root, "src/host.ts")},
          preserveEntrySignatures: "strict",
          output: {entryFileNames: "assets/[name]-[hash].js"},
        }},
      })
      if(Array.isArray(result) || !("output" in result)) throw new Error("Expected a single bundle")
      const host = result.output.find(item => item.type === "chunk" && item.name === "host")!
      if(host.type !== "chunk") throw new Error("Missing host chunk")
      // Loading the host must expose URLs without executing the frame modules.
      const code = host.code.replaceAll("import.meta.url", JSON.stringify(`https://authors.example/nested/${host.fileName}`))
      const {default: urls} = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`)
      expect(host.code).not.toContain("globalThis[")
      for(const [index, url] of (urls as string[]).entries()) {
        expect(url).toMatch(new RegExp(`^/nested/assets/${names[index]}-[\\w-]+\\.js$`))
        expect(new URL(url, "https://content.example/").origin).toBe("https://content.example")
        expect(result.output.some(item => `/nested/${item.fileName}` === url)).toBe(true)
      }
      return {urls, fileName: host.fileName}
    }
    const first = await compile()
    await writeFile(join(root, "src/shared.ts"), 'export const revision = "second"')
    const second = await compile()
    for(const [index, url] of first.urls.entries()) expect(second.urls[index]).not.toBe(url)
    expect(second.fileName).not.toBe(first.fileName)
  }
  finally { await rm(root, {recursive: true, force: true}) }
})
