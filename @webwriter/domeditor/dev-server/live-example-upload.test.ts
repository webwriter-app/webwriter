// @vitest-environment node
import {expect, it} from "vitest"
import {readWidgetFolder, resolveFolderImports} from "./live-example-upload.js"
import {widgetFiles} from "./live-example-save.js"

function folder(files: Record<string, string>, prefix = ""): FileSystemDirectoryHandle {
  return {
    async getDirectoryHandle(name: string) { return folder(files, prefix + name + "/") },
    async getFileHandle(name: string) {
      const text = files[prefix + name]
      if(text === undefined) throw new DOMException("Missing", "NotFoundError")
      return {async getFile() { return {async text() { return text }} }}
    },
  } as unknown as FileSystemDirectoryHandle
}

it("reads one widget through a source export, resolves local imports, and retains source paths when saving", async () => {
  const manifest = {
    name: "test-package",
    exports: {
      "./widgets/ww-test.*": {source: "./src/widget.ts", default: "./dist/widget.*"},
      "./widgets/ww-test.css": "./src/widget.css",
    },
    imports: {"#message": "./data/message.js"},
  }
  const source = "import {message} from '#message'; export const title = message"
  const project = await readWidgetFolder(folder({
    "package.json": JSON.stringify(manifest),
    "src/widget.ts": source,
    "src/widget.css": "ww-test { display: block }",
    "data/message.js": "export {message} from './text.js'",
    "data/text.js": "export const message = 'Hello'",
  }))
  expect(project.language).toBe("ts")
  expect(project.markup).toContain("<ww-test></ww-test>")
  expect(project.markup).toContain("display: block")
  expect(await resolveFolderImports(source, project.sourcePath, project.shared, manifest.imports, project.aliases))
    .toContain("from '#local/data/message.js'")
  expect(await resolveFolderImports(project.shared[0].code, project.shared[0].path, project.shared, manifest.imports, project.aliases))
    .toContain("from '#local/data/text.js'")
  expect([...widgetFiles(project).keys()]).toEqual([
    "src/widget.css", "data/message.js", "data/text.js", "src/widget.ts", "package.json",
  ])
})

it("rejects packages that declare more than one widget, even when the exports share a file", async () => {
  const exports = {"./widgets/ww-first.js": "./widget.js", "./widgets/ww-second.js": "./widget.js"}
  await expect(readWidgetFolder(folder({"package.json": JSON.stringify({exports})}))).rejects.toThrow("exactly one widget")
})

it("opens the Vue component through its registration entry", async () => {
  const exports = {"./widgets/ww-test.js": {source: "./src/register.js", default: "./dist/widget.js"}}
  const registration = 'import Widget from "./Test.vue"'
  const project = await readWidgetFolder(folder({
    "package.json": JSON.stringify({exports}),
    "src/register.js": registration,
    "src/Test.vue": "<template>Hello</template>",
  }))
  expect(project.sourcePath).toBe("src/Test.vue")
  expect(project.library).toBe("vue")
  expect(widgetFiles(project).get("src/register.js")).toBe(registration)
})
