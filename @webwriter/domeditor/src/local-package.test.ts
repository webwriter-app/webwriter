import {describe, expect, it} from "vitest"
import {PACKAGE_DOCUMENTATION_MAX_BYTES, PACKAGE_DOCUMENTATION_MAX_CHARS} from "./packages"
import {loadLocalPackage, localPackageWatchPaths, readLocalPackageReadme, type LocalPackageDirectory} from "./local-package"

type Node = {files?: Record<string, string>, directories?: Record<string, Node>}
const directory = (node: Node): LocalPackageDirectory => ({
  getFileHandle: async (name: string) => {
    const text = node.files?.[name]
    if(text === undefined) throw new Error(`Missing ${name}`)
    return {getFile: async () => ({size: new TextEncoder().encode(text).byteLength, text: async () => text})}
  },
})

const nestedDirectory = (root: Node): LocalPackageDirectory => ({
  getFileHandle: async (name: string) => {
    if(root.files?.[name] !== undefined) return {getFile: async () => ({size: new TextEncoder().encode(root.files![name]).byteLength, text: async () => root.files![name]})}
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

describe("readLocalPackageReadme", () => {
  it("reads the current README and reflects edits without caching", async () => {
    const files = {"README.md": "one\ntwo\nthree"}
    const root = directory({files})
    const options = {packageName: "@local/demo", version: "0.1.0", startLine: 2, lineCount: 1}

    await expect(readLocalPackageReadme(root, options)).resolves.toMatchObject({
      source: "local",
      packageName: "@local/demo",
      version: "0.1.0",
      status: "available",
      path: "README.md",
      markdown: "two",
      startLine: 2,
      endLine: 2,
      totalLines: 3,
    })
    files["README.md"] = "updated"
    await expect(readLocalPackageReadme(root, {...options, startLine: 1})).resolves.toMatchObject({markdown: "updated", startLine: 1, endLine: 1})
  })

  it("reports missing documentation explicitly and honors cancellation", async () => {
    await expect(readLocalPackageReadme(directory({files: {}}), {
      packageName: "@local/demo", version: "0.1.0",
    })).resolves.toMatchObject({source: "local", status: "unavailable", reason: "not-found"})
    const controller = new AbortController()
    controller.abort()
    await expect(readLocalPackageReadme(directory({files: {"README.md": "text"}}), {
      packageName: "@local/demo", version: "0.1.0", signal: controller.signal,
    })).rejects.toMatchObject({name: "AbortError"})
  })

  it("rejects an oversized local README before reading its body", async () => {
    let read = false
    const root: LocalPackageDirectory = {
      getFileHandle: async (name: string) => {
        if(name !== "README.md") throw new Error(`Missing ${name}`)
        return {getFile: async () => ({
          size: PACKAGE_DOCUMENTATION_MAX_BYTES + 1,
          text: async () => { read = true; return "unavailable" },
        })}
      },
    }
    await expect(readLocalPackageReadme(root, {packageName: "@local/demo", version: "0.1.0"}))
      .resolves.toMatchObject({status: "unavailable", reason: "too-large"})
    expect(read).toBe(false)
  })

  it("rejects an excessively long local README excerpt", async () => {
    await expect(readLocalPackageReadme(directory({files: {"README.md": "x".repeat(PACKAGE_DOCUMENTATION_MAX_CHARS + 1)}}), {
      packageName: "@local/demo", version: "0.1.0",
    })).resolves.toMatchObject({status: "unavailable", reason: "too-large"})
  })
})
