import {describe, expect, it} from "vitest"
import {loadLocalPackage, localPackageWatchPaths, type LocalPackageDirectory} from "./local-package"

type Node = {files?: Record<string, string>, directories?: Record<string, Node>}
const directory = (node: Node): LocalPackageDirectory => ({
  getFileHandle: async (name: string) => {
    const text = node.files?.[name]
    if(text === undefined) throw new Error(`Missing ${name}`)
    return {getFile: async () => ({text: async () => text})}
  },
})

const nestedDirectory = (root: Node): LocalPackageDirectory => ({
  getFileHandle: async (name: string) => {
    if(root.files?.[name] !== undefined) return {getFile: async () => ({text: async () => root.files![name]})}
    const child = root.directories?.[name]
    if(child) return nestedDirectory(child) as never
    throw new Error(`Missing ${name}`)
  },
})

const manifest = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  name: "@local/demo",
  version: "0.1.0",
  description: "Local demo",
  exports: {
    "./icon": "./icon.svg",
    "./widgets/demo.*": "./dist/demo.*",
    "./snippets/example.html": "./snippets/example.html",
    ...overrides,
  },
  editingConfig: {"./widgets/demo": {label: "Inline demo"}},
})

const urlFor = (path: string) => `http://local.test/pkg/${path}`

describe("loadLocalPackage", () => {
  it("derives polling paths for the manifest and generated wildcard assets", () => {
    expect(localPackageWatchPaths(JSON.parse(manifest()) as never)).toEqual([
      "package.json", "icon.svg", "dist/demo.js", "dist/demo.css", "snippets/example.html",
    ])
  })

  it("resolves local widget/snippet assets and metadata through the injected URL builder", async () => {
    const result = await loadLocalPackage(nestedDirectory({
      files: {"package.json": manifest(), "icon.svg": "icon"},
      directories: {
        dist: {files: {"demo.js": "bundle", "demo.css": "style"}},
        snippets: {files: {"example.html": "<p>Example</p>"}},
      },
    }), {urlFor, locale: "en"})

    expect(result.warnings).toEqual([])
    expect(result.package).toMatchObject({
      name: "@local/demo",
      label: "Demo",
      iconUrl: "http://local.test/pkg/icon.svg",
      scripts: ["http://local.test/pkg/dist/demo.js"],
      styles: ["http://local.test/pkg/dist/demo.css"],
    })
    expect(result.package.members).toEqual(expect.arrayContaining([
      expect.objectContaining({kind: "widget", scriptUrl: "http://local.test/pkg/dist/demo.js", styleUrl: "http://local.test/pkg/dist/demo.css"}),
      expect.objectContaining({kind: "snippet", htmlUrl: "http://local.test/pkg/snippets/example.html"}),
    ]))
  })

  it("uses browser, then import, then default export targets", async () => {
    const result = await loadLocalPackage(nestedDirectory({
      files: {"package.json": manifest({"./widgets/demo.*": {browser: "./dist/browser.*", import: "./dist/import.*", default: "./dist/default.*"}}), "icon.svg": "icon"},
      directories: {dist: {files: {"browser.js": "bundle"}}},
    }), {urlFor})
    expect(result.package.scripts).toEqual(["http://local.test/pkg/dist/browser.js"])
  })

  it("reports a missing configured bundle while returning usable metadata", async () => {
    const result = await loadLocalPackage(directory({files: {"package.json": manifest(), "icon.svg": "icon"}}), {urlFor})
    expect(result.package.members).toEqual([])
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "missing-export", path: "./dist/demo.*"}),
      expect.objectContaining({code: "missing-bundle"}),
    ]))
  })

  it("keeps inline config when optional external editing config is missing", async () => {
    const result = await loadLocalPackage(nestedDirectory({
      files: {"package.json": manifest({"./editing-config.json": "./config/editing-config.json"}), "icon.svg": "icon"},
      directories: {dist: {files: {"demo.js": "bundle"}}},
    }), {urlFor})
    expect(result.package.members).toEqual(expect.arrayContaining([expect.objectContaining({label: "Inline demo"})]))
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({code: "editing-config-unavailable"})]))
  })

  it("rejects a missing and malformed manifest explicitly", async () => {
    await expect(loadLocalPackage(directory({files: {}}), {urlFor})).rejects.toMatchObject({code: "missing-manifest"})
    await expect(loadLocalPackage(directory({files: {"package.json": "{}"}}), {urlFor})).rejects.toMatchObject({code: "invalid-manifest"})
    await expect(loadLocalPackage(directory({files: {"package.json": JSON.stringify({name: "demo", version: "1.0.0"})}}), {urlFor}))
      .rejects.toMatchObject({code: "invalid-manifest"})
    await expect(loadLocalPackage(directory({files: {"package.json": JSON.stringify({name: "@local/demo", version: "next"})}}), {urlFor}))
      .rejects.toMatchObject({code: "invalid-manifest"})
    await expect(loadLocalPackage(directory({files: {"package.json": manifest({"./widgets/unsafe.js": "../outside.js"})}}), {urlFor}))
      .rejects.toMatchObject({code: "invalid-manifest"})
  })

  it("preserves folder permission failures as a recoverable error", async () => {
    const denied: LocalPackageDirectory = {
      getFileHandle: async () => { throw Object.assign(new Error("Denied"), {name: "NotAllowedError"}) },
    }
    await expect(loadLocalPackage(denied, {urlFor})).rejects.toMatchObject({
      code: "manifest-read-failed",
      message: expect.stringContaining("Select the folder again"),
    })
  })
})
