// @vitest-environment happy-dom
import {afterAll, afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {DOMEditor} from "../domeditor"
import type {WebWriterPackage} from "../packages"
import {Schema} from "../schema"
import {MigrationFeature, type MigrationRequest} from "./migration"

const migrationUrl = "https://cdn.test/@webwriter/quiz@2.0.0/dist/migrate.js"
const quizPackage: WebWriterPackage = {
  name: "@webwriter/quiz",
  version: "2.0.0",
  label: "Quiz",
  authors: [],
  keywords: [],
  links: {},
  scripts: [],
  styles: [],
  migrationUrl,
  members: [{
    id: "@webwriter/quiz@2.0.0:./widgets/ww-quiz",
    packageName: "@webwriter/quiz",
    packageVersion: "2.0.0",
    exportName: "./widgets/ww-quiz.*",
    kind: "widget",
    label: "Quiz",
    insertable: true,
    tagName: "ww-quiz",
  }],
}

/** Stands in for the sandboxed frame: applies `migrate` to each item. */
const runnerFor = (migrate: (element: Element, request: MigrationRequest) => void) => vi.fn(async (request: MigrationRequest) => {
  return request.items.map(item => {
    const template = document.createElement("template")
    template.innerHTML = item
    template.content.querySelectorAll(request.tagNames.join(",")).forEach(element => migrate(element, request))
    return template.innerHTML
  })
})

const renameAnswer = (element: Element) => {
  if(!element.hasAttribute("answer")) return
  element.setAttribute("solution", element.getAttribute("answer")!)
  element.removeAttribute("answer")
}

const editor = new DOMEditor()
const migration = editor.features.migration

beforeEach(() => {
  document.body.innerHTML = "<p>Start</p>"
  editor.schema = new Schema()
  editor.schema.extendWidgets([{tagName: "ww-quiz"}])
  vi.spyOn(editor.features.dependency, "installedPackages", "get").mockReturnValue([quizPackage])
  vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
    if(String(input) === migrationUrl) return new Response("document.addEventListener('migrate', () => {})")
    return new Response("", {status: 404})
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(() => editor.destroy())

describe("MigrationFeature", () => {
  it("does not start a sandbox when its download settles after disable", async () => {
    const feature = new MigrationFeature(editor)
    feature.enable()
    let release!: (response: Response) => void
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    feature.runner = runnerFor(renameAnswer)
    const html = '<ww-quiz answer="1"></ww-quiz>'
    const pending = feature.migrate(html)
    feature.disable()
    release(new Response("document.addEventListener('migrate', () => {})"))
    await expect(pending).resolves.toBe(html)
    expect(feature.runner).not.toHaveBeenCalled()
  })

  it("removes a pending sandbox and settles its migration on disable", async () => {
    const feature = new MigrationFeature(editor)
    feature.enable()
    const html = '<ww-quiz answer="1"></ww-quiz>'
    const pending = feature.migrate(html)
    await new Promise(resolve => setTimeout(resolve))
    expect(editor.appendix.querySelector('iframe[sandbox="allow-scripts"]')).not.toBeNull()
    feature.disable()
    expect(editor.appendix.querySelector('iframe[sandbox="allow-scripts"]')).toBeNull()
    await expect(pending).resolves.toBe(html)
  })

  it("replaces each outermost widget with its migration result", async () => {
    migration.runner = runnerFor(renameAnswer)
    const html = '<p>Keep <b>this</b></p><ww-quiz answer="1"><ww-quiz answer="2"></ww-quiz></ww-quiz><ww-quiz></ww-quiz>'
    await expect(migration.migrate(html)).resolves.toBe(
      '<p>Keep <b>this</b></p><ww-quiz solution="1"><ww-quiz solution="2"></ww-quiz></ww-quiz><ww-quiz></ww-quiz>',
    )
    expect(migration.runner).toHaveBeenCalledWith(expect.objectContaining({
      packageName: "@webwriter/quiz",
      version: "2.0.0",
      source: "document.addEventListener('migrate', () => {})",
      tagNames: ["ww-quiz"],
      items: ['<ww-quiz answer="1"><ww-quiz answer="2"></ww-quiz></ww-quiz>', "<ww-quiz></ww-quiz>"],
    }), expect.any(Number))
  })

  it("skips content without widgets of migrating packages", async () => {
    migration.runner = runnerFor(renameAnswer)
    expect(migration.needsMigration("<p>ww-quiz</p><other-widget></other-widget>")).toBe(false)
    await expect(migration.migrate("<p>Text</p>")).resolves.toBe("<p>Text</p>")
    expect(migration.runner).not.toHaveBeenCalled()
  })

  it.each([
    ["an error", async () => { throw new Error("broken") }],
    ["a timeout", () => new Promise(() => {})],
    ["a wrong result count", async () => []],
    ["a non-string result", async () => [42]],
    ["an empty result", async () => ["  "]],
  ])("keeps the original content after %s", async (_, runner) => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.useFakeTimers()
    migration.runner = (request, timeout) => Promise.race([
      (runner as () => Promise<unknown>)(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), timeout)),
    ])
    const html = '<ww-quiz answer="1"></ww-quiz>'
    const result = migration.migrate(html)
    await vi.runAllTimersAsync()
    await expect(result).resolves.toBe(html)
    vi.useRealTimers()
  })

  it("keeps the original content when the migration cannot be downloaded", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.mocked(fetch).mockResolvedValue(new Response("", {status: 500}))
    vi.spyOn(editor.features.dependency, "installedPackages", "get")
      .mockReturnValue([{...quizPackage, migrationUrl: "https://cdn.test/unavailable/migrate.js"}])
    migration.runner = runnerFor(renameAnswer)
    await expect(migration.migrate('<ww-quiz answer="1"></ww-quiz>')).resolves.toBe('<ww-quiz answer="1"></ww-quiz>')
  })

  it("migrates widgets inserted through the insert action", async () => {
    migration.runner = runnerFor(renameAnswer)
    const paragraph = document.querySelector("p")!
    const selection = document.getSelection()!
    selection.removeAllRanges()
    const range = document.createRange()
    range.setStart(paragraph, 1)
    selection.addRange(range)
    await editor.getActionHandler("insert")({type: "insert", html: '<ww-quiz answer="1"></ww-quiz>'})
    expect(editor.toHTML(true)).toContain(`<ww-quiz solution="1" id="${document.querySelector("ww-quiz")!.id}"></ww-quiz>`)
  })
})

describe("MigrationFeature insertion", () => {
  it("inserts at the selection from before the migration started", async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const migrate = runnerFor(renameAnswer)
    migration.runner = async request => { await gate; return migrate(request) }
    document.body.innerHTML = "<p>First</p><p>Second</p>"
    const [first, second] = Array.from(document.querySelectorAll("p"))
    const select = (node: Node) => {
      const range = document.createRange()
      range.setStart(node, 1)
      document.getSelection()!.removeAllRanges()
      document.getSelection()!.addRange(range)
    }
    select(first)
    const inserting = editor.getActionHandler("insert")({type: "insert", html: '<ww-quiz answer="1"></ww-quiz>'})
    select(second)
    release()
    await inserting
    const children = Array.from(document.body.children)
    const quiz = document.querySelector("ww-quiz")!
    expect(children.indexOf(quiz)).toBeLessThan(children.indexOf(second))
    expect(children.indexOf(quiz)).toBeLessThanOrEqual(children.indexOf(first))
  })
})
