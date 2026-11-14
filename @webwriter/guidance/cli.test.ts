// @vitest-environment node
import {spawnSync} from "node:child_process"
import {readFileSync} from "node:fs"
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
