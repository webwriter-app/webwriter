// @vitest-environment node
import {spawnSync} from "node:child_process"
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {fileURLToPath} from "node:url"
import {expect, it} from "vitest"

const cli = fileURLToPath(new URL("./cli.mjs", import.meta.url))
const docs = new URL("../domeditor/docs/widgets/", import.meta.url)

function run(...args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {encoding: "utf8"})
}

it.each([
  ["widget package exports", "reference/distribution"],
  ["participant data scopes", "guides/sharing"],
  ["optionschange", "reference/options-actions"],
  ["withWidgetRuntime", "reference/adapters"],
])("finds %s in the WebWriter documentation", (query, id) => {
  const result = run("search", query)

  expect(result.status).toBe(0)
  expect(JSON.parse(result.stdout)[0]).toEqual({id, description: expect.any(String)})
})

it("lists distinct documentation paths and omits example files", () => {
  const result = run("list")

  expect(result.status).toBe(0)
  const ids = JSON.parse(result.stdout).map(({id}) => id)
  expect(ids).toEqual(expect.arrayContaining(["index", "guides/index", "reference/index"]))
  expect(new Set(ids).size).toBe(ids.length)
  expect(ids.some(id => id.startsWith("examples/"))).toBe(false)
})

it("retrieves the Markdown for multiple IDs in order", () => {
  const ids = ["reference/distribution", "guides/migrations"]
  const result = run("retrieve", ids.join(","))

  expect(result.status).toBe(0)
  expect(result.stdout).toBe(ids.map(id => {
    const markdown = readFileSync(new URL(`${id}.md`, docs), "utf8")
    return `--- docs/widgets/${id}.md ---\n\n${markdown.trimEnd()}\n`
  }).join("\n"))
})

it("returns an empty search and rejects paths outside the catalog", () => {
  const search = run("search", "quasar zxqv")
  expect(search.status).toBe(0)
  expect(JSON.parse(search.stdout)).toEqual([])

  const retrieve = run("retrieve", "../package.json")
  expect(retrieve.status).toBe(1)
  expect(retrieve.stderr).toContain("Unknown documentation ID")
  expect(retrieve.stdout).toBe("")
})

it("lists the documentation badges with retrievable guides", () => {
  const result = run("badges")
  expect(result.status).toBe(0)
  const catalog = JSON.parse(result.stdout)
  const mapping = JSON.parse(readFileSync(new URL("../domeditor/src/widget-keywords.json", import.meta.url), "utf8"))
  const guideIds = new Set(JSON.parse(run("list").stdout).map(({id}) => id))

  expect(catalog.map(({keyword}) => keyword)).toEqual(Object.keys(mapping.badges))
  for(const [id, keywords] of Object.entries<string[]>(mapping.guides)) {
    const guide = `guides/${id}`
    expect(guideIds.has(guide), guide).toBe(true)
    expect(catalog.filter(entry => entry.guides.includes(guide)).map(({keyword}) => keyword).sort())
      .toEqual([...keywords].sort())
  }
})

it("resolves manifest badges without losing format, language, or version values", () => {
  const directory = mkdtempSync(join(tmpdir(), "widget manifest "))
  try {
    const manifest = join(directory, "package.json")
    writeFileSync(manifest, JSON.stringify({keywords: [
      "widget-online-use", "widget-convertible-to-image/svg+xml", "widget-lang-en-US",
      "widget-migrates-from-1.2.0-RC.1", "widget-lang-fr-CA", "widget-lang-", "widget-lang-en-US",
      "widget-online", "custom-keyword",
    ]}))
    const result = run("badges", manifest)
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout).map(({keyword, guides}) => [keyword, guides])).toEqual([
      ["widget-online-use", ["guides/libraries"]],
      ["widget-convertible-to-image/svg+xml", ["guides/conversions"]],
      ["widget-lang-en-US", ["guides/localization"]],
      ["widget-migrates-from-1.2.0-RC.1", ["guides/migrations"]],
      ["widget-lang-fr-CA", ["guides/localization"]],
      ["widget-online", ["guides/libraries"]],
    ])
  }
  finally {
    rmSync(directory, {recursive: true})
  }
})
