// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import type {WebWriterPackage} from "../packages"
import {DeveloperConsole} from "./developer-console"
import {RibbonButton} from "./ribbon-button"

const localPackage = (name: string): WebWriterPackage => ({
  name: `@local/${name.toLowerCase()}`,
  version: "0.0.0-local",
  label: name,
  description: `${name} local package`,
  authors: [],
  keywords: [name],
  links: {},
  members: [],
  scripts: [],
  styles: [],
  manifest: {
    name: `@local/${name.toLowerCase()}`,
    version: "0.0.0-local",
    description: `${name} local package`,
    author: "Ada Lovelace <ada@example.test>",
    contributors: ["Grace Hopper <grace@example.test>"],
    license: "MIT",
    keywords: ["webwriter-widget", name.toLowerCase()],
    exports: {"./widgets/demo.*": "./dist/demo.*", "./icon": "./src/icon.svg"},
    customElements: "custom-elements.json",
    editingConfig: {".": {label: "Demo"}},
  },
})

afterEach(() => document.body.replaceChildren())

describe("Developer console packages", () => {
  it("updates sticky column offsets after resizing and releases observation on removal", async () => {
    const instances: {callback: ResizeObserverCallback, observe: ReturnType<typeof vi.fn>, disconnect: ReturnType<typeof vi.fn>}[] = []
    vi.stubGlobal("ResizeObserver", class {
      observe = vi.fn()
      disconnect = vi.fn()
      constructor(public callback: ResizeObserverCallback) {instances.push(this)}
    })
    try {
      const toolbox = new DeveloperConsole()
      toolbox.localPackages = [localPackage("Alpha")]
      document.body.append(toolbox)
      await toolbox.updateComplete
      const drawer = toolbox.shadowRoot!.querySelector<HTMLElement>('ribbon-drawer[layout="metadata"]')!
      const columns = Array.from(drawer.querySelectorAll<HTMLElement>(".develop-section, .develop-secondary-column"))
      Object.defineProperty(drawer, "clientHeight", {configurable: true, value: 240})
      columns.forEach((column, index) => Object.defineProperty(column, "offsetHeight", {value: index ? 100 : 400}))
      const observer = instances.find(instance => instance.observe.mock.calls.some(([element]) => element === drawer))!
      observer.callback([], observer as unknown as ResizeObserver)
      expect(columns[0].style.getPropertyValue("--column-sticky-top")).toBe("-168px")
      expect(columns[1].style.getPropertyValue("--column-sticky-top")).toBe("0px")
      Object.defineProperty(drawer, "clientHeight", {value: 500})
      observer.callback([], observer as unknown as ResizeObserver)
      expect(columns[0].style.getPropertyValue("--column-sticky-top")).toBe("0px")
      toolbox.remove()
      expect(observer.disconnect).toHaveBeenCalled()
    }
    finally {vi.unstubAllGlobals()}
  })

  it("shows local package actions and selects packages from a scrollable vertical list", async () => {
    const toolbox = new DeveloperConsole()
    toolbox.tab = "Packages"
    toolbox.localPackages = [localPackage("Alpha"), localPackage("Beta")]
    document.body.append(toolbox)
    await toolbox.updateComplete

    expect(toolbox.shadowRoot!.querySelector('button[data-tool="Develop"]')).toBeNull()
    expect(toolbox.shadowRoot!.querySelector('#console-tab-Packages[aria-selected="true"]')).not.toBeNull()
    const drawer = toolbox.shadowRoot!.querySelector<HTMLElement>(".local-packages-drawer")!
    const list = drawer.querySelector<HTMLElement>(".local-package-list")!
    const items = Array.from(list.querySelectorAll<HTMLButtonElement>(".local-package-item"))
    expect(drawer.querySelector("select")).toBeNull()
    expect(getComputedStyle(drawer.querySelector<HTMLElement>(".local-package-actions")!).boxSizing).toBe("border-box")
    expect(getComputedStyle(list).overflow).toBe("auto")
    expect(items.map(item => item.querySelector(".local-package-name")!.textContent)).toEqual(["@local/alpha", "@local/beta"])
    expect(items.map(item => item.getAttribute("aria-pressed"))).toEqual(["true", "false"])
    expect(drawer.querySelector<RibbonButton>('ribbon-button[label="Load"]')).not.toBeNull()
    expect(drawer.querySelector<RibbonButton>('ribbon-button[label="New"]')).not.toBeNull()
    expect(Array.from(drawer.children).slice(0, 2).map(element => element.className)).toEqual([
      "local-package-list",
      "local-package-actions",
    ])
    expect(drawer.querySelector("package-search")).toBeNull()
    expect(drawer.querySelectorAll<RibbonButton>('ribbon-button[variant="package"]')).toHaveLength(0)

    const load = drawer.querySelector<RibbonButton>('ribbon-button[label="Load"]')!
    await load.updateComplete
    expect(load.getAttribute("variant")).toBe("toolbar")
    expect(getComputedStyle(load.shadowRoot!.querySelector<HTMLElement>(".main-button")!).flexDirection).toBe("row")
    expect(load.shadowRoot!.querySelector(".icon-tabler-folder-open")).not.toBeNull()
    const listener = vi.fn()
    toolbox.addEventListener("ribbon-button-click", listener)
    load.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({label: "local-package-add"}),
    }))

    const create = drawer.querySelector<RibbonButton>('ribbon-button[label="New"]')!
    create.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({label: "local-package-new"}),
    }))

    items[1].click()
    await toolbox.updateComplete
    expect(toolbox.selectedLocalPackageName).toBe("@local/beta")
    expect(items[1].getAttribute("aria-pressed")).toBe("true")
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({detail: {label: "local-package-select:@local/beta"}}))
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Metadata"]')).not.toBeNull()
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Development"]')).toBeNull()
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Exports"]')).toBeNull()

    const metadata = toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Metadata"]')!
    await (metadata as HTMLElement & {updateComplete: Promise<unknown>}).updateComplete
    expect((metadata as HTMLElement & {hidePaneLabel: boolean}).hidePaneLabel).toBe(true)
    expect(getComputedStyle(metadata.shadowRoot!.querySelector<HTMLElement>(".pane-label")!).display).toBe("none")
    const metadataChange = vi.fn()
    toolbox.addEventListener("local-package-metadata-change", metadataChange)
    expect(Array.from(metadata.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[name], textarea[name]"), field => field.name)).toEqual([
      "name", "version", "description", "license", "keywords", "author", "customElements", "editingConfig",
    ])
    expect(metadata.querySelector<HTMLDetailsElement>(".develop-compact-details")!.open).toBe(false)
    expect(metadata.textContent).not.toContain("Contributors")
    const addContributorButton = metadata.querySelector<HTMLButtonElement>('button[aria-label="Add contributor"]')!
    expect(addContributorButton.parentElement!.textContent).toContain("Author")
    expect(metadata.querySelector<HTMLInputElement>('input[name="author"]')!.tagName).toBe("INPUT")
    const packageName = metadata.querySelector<HTMLInputElement>('input[name="name"]')!
    const version = metadata.querySelector<HTMLInputElement>('input[name="version"]')!
    expect(packageName.pattern).toBeTruthy()
    expect(version.pattern).toBeTruthy()
    packageName.value = "unscoped"
    packageName.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    version.value = "next"
    version.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(packageName.checkValidity()).toBe(false)
    expect(version.checkValidity()).toBe(false)
    expect(metadataChange).not.toHaveBeenCalled()
    const description = metadata.querySelector<HTMLTextAreaElement>('textarea[name="description"]')!
    description.value = "Updated description"
    description.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(metadataChange).toHaveBeenCalledWith(expect.objectContaining({
      detail: {field: "description", value: "Updated description"},
    }))

    const contributorChange = vi.fn()
    const contributorAdd = vi.fn()
    const contributorDelete = vi.fn()
    toolbox.addEventListener("local-package-contributor-change", contributorChange)
    toolbox.addEventListener("local-package-contributor-add", contributorAdd)
    toolbox.addEventListener("local-package-contributor-delete", contributorDelete)
    const contributor = metadata.querySelector<HTMLInputElement>('input[aria-label="Contributor 1"]')!
    contributor.value = "Katherine Johnson <katherine@example.test>"
    contributor.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    addContributorButton.click()
    metadata.querySelector<HTMLButtonElement>('button[aria-label="Delete contributor 1"]')!.click()
    expect(contributorChange).toHaveBeenCalledWith(expect.objectContaining({
      detail: {index: 0, value: "Katherine Johnson <katherine@example.test>"},
    }))
    expect(contributorAdd).toHaveBeenCalledTimes(1)
    expect(contributorDelete).toHaveBeenCalledWith(expect.objectContaining({detail: {index: 0}}))

    expect(drawer.querySelector(".local-package-auto-reload")).toBeNull()
  })

  it("falls back to the current first package after the selected package is replaced", async () => {
    const console = new DeveloperConsole()
    console.localPackages = [localPackage("Alpha"), localPackage("Beta")]
    console.selectedLocalPackageName = "@local/beta"
    document.body.append(console)
    await console.updateComplete
    console.localPackages = [localPackage("Gamma")]
    await console.updateComplete
    expect(console.shadowRoot!.querySelector('.local-package-item[aria-pressed="true"] .local-package-name')!.textContent).toBe("@local/gamma")
    expect(console.shadowRoot!.querySelector<HTMLInputElement>('input[name="name"]')!.value).toBe("@local/gamma")
  })

  it("collapses exports by default, sorts by type, and preserves each card's expanded state", async () => {
    const pkg = localPackage("Alpha")
    const exports = ["./custom-elements.json", "./icon", "./tests/check.*", "./themes/theme.html", "./editing-config.json", "./widgets/b.*", "./migrate.js", "./snippets/demo.html", "./widgets/a.*", "./other"]
    pkg.manifest!.exports = Object.fromEntries(exports.map(name => [name, "./src/file.ts"]))
    const toolbox = new DeveloperConsole()
    toolbox.localPackages = [pkg, localPackage("Beta")]
    document.body.append(toolbox)
    await toolbox.updateComplete
    const cards = Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLElement>(".develop-export-card"))
    expect(cards.map(card => card.dataset.exportName)).toEqual([
      "./widgets/b.*", "./widgets/a.*", "./tests/check.*", "./migrate.js", "./snippets/demo.html",
      "./themes/theme.html", "./icon", "./editing-config.json", "./custom-elements.json", "./other",
    ])
    for(const card of cards) {
      expect(card.querySelector<HTMLDetailsElement>("details")!.open).toBe(false)
      const summary = card.querySelector("summary")!
      expect(summary.querySelector(".develop-export-type-icon svg")).not.toBeNull()
      expect(summary.querySelector(".develop-export-type-icon")!.nextElementSibling!.textContent).toBe(card.dataset.exportName)
      expect(summary.querySelector("input, select")).toBeNull()
      expect(card.querySelectorAll(".develop-export-card-fields input, .develop-export-card-fields select")).toHaveLength(3)
    }
    expect(cards[8].querySelector('option[value="custom-elements"]')!.textContent).toBe("Custom elements manifest")
    const details = cards[0].querySelector<HTMLDetailsElement>("details")!
    details.querySelector("summary")!.click()
    expect(details.open).toBe(true)
    toolbox.autoReload = false
    await toolbox.updateComplete
    expect(details.open).toBe(true)
    details.querySelector("summary")!.click()
    expect(details.open).toBe(false)
    details.open = true
    toolbox.selectedLocalPackageName = "@local/beta"
    await toolbox.updateComplete
    expect(Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLDetailsElement>(".develop-export-details")).every(card => !card.open)).toBe(true)
    expect(Object.keys(pkg.manifest!.exports!)).toEqual(exports)
  })

  it("edits package exports as typed cards", async() => {
    const pkg = localPackage("Alpha")
    pkg.members = [{
      id: "local/Alpha@0.0.0-local:./widgets/alpha",
      packageName: pkg.name,
      packageVersion: pkg.version,
      exportName: "./widgets/alpha.*",
      kind: "widget",
      label: "Alpha widget",
      insertable: true,
      tagName: "alpha-widget",
    }]
    const toolbox = new DeveloperConsole()
    toolbox.tab = "Packages"
    toolbox.localPackages = [pkg]
    toolbox.selectedLocalPackageName = pkg.name
    document.body.append(toolbox)
    await toolbox.updateComplete
    const metadata = toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Metadata"]')!
    const card = metadata.querySelector<HTMLElement>('.develop-export-card[data-export-name="./widgets/demo.*"]')!
    expect(card).not.toBeNull()
    card.querySelector<HTMLDetailsElement>("details")!.open = true
    expect(card.querySelector<HTMLSelectElement>("select")!.value).toBe("widget")
    const fields = card.querySelectorAll<HTMLInputElement>("input")
    expect(fields[0].value).toBe("demo")
    expect(fields[1].value).toBe("./dist/demo.*")

    const changed = vi.fn()
    const added = vi.fn()
    const deleted = vi.fn()
    const picked = vi.fn()
    toolbox.addEventListener("local-package-export-change", changed)
    toolbox.addEventListener("local-package-export-add", added)
    toolbox.addEventListener("local-package-export-delete", deleted)
    toolbox.addEventListener("local-package-export-file-pick", picked)

    fields[1].value = "./src/widgets/demo.ts"
    fields[1].dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({
      detail: {exportName: "./widgets/demo.*", field: "source", value: "./src/widgets/demo.ts"},
    }))

    metadata.querySelector<HTMLButtonElement>('button[aria-label="Create export"]')!.click()
    card.querySelector<HTMLButtonElement>('button[aria-label^="Delete export"]')!.click()
    card.querySelector<HTMLButtonElement>('button[aria-label^="Choose source file"]')!.click()
    expect(added).toHaveBeenCalledTimes(1)
    expect(deleted).toHaveBeenCalledWith(expect.objectContaining({detail: {exportName: "./widgets/demo.*"}}))
    expect(picked).toHaveBeenCalledWith(expect.objectContaining({detail: {exportName: "./widgets/demo.*"}}))
  })
})

describe("Developer console checks and tests", () => {
  it("lists package checks and runs tests", async () => {
    const toolbox = new DeveloperConsole()
    toolbox.tab = "Tests"
    const pkg = {...localPackage("Alpha"), tests: [{name: "basics", scriptUrl: "http://local.test/basics.js"}, {name: "slow", scriptUrl: "http://local.test/slow.js"}]}
    toolbox.localPackages = [pkg]
    toolbox.localPackageWarnings = {[pkg.name]: [{code: "unknown-editing-option", path: "./widgets/demo", message: "Editing config './widgets/demo' has an unknown option 'selectable'."}]}
    toolbox.localPackageTestResults = {
      [`${pkg.name}/basics`]: {status: "failed", tests: [
        {id: "1", path: ["Demo", "renders"], passed: true},
        {id: "2", path: ["Demo", "saves"], passed: false},
      ]},
      [`${pkg.name}/slow`]: "running",
    }
    document.body.append(toolbox)
    await toolbox.updateComplete
    const drawer = toolbox.shadowRoot!.querySelector('.test-content')!
    expect(drawer.querySelector(".develop-check")?.textContent).toContain("unknown option 'selectable'")
    const [basics, slow] = drawer.querySelectorAll<HTMLElement>(".develop-test")
    expect(basics.dataset.status).toBe("failed")
    expect(basics.querySelector('[role="status"]')?.textContent).toBe("1/2 passed")
    expect(basics.querySelector(".develop-check")?.textContent).toBe("Demo › saves")
    expect(slow.querySelector("button")?.disabled).toBe(true)

    const run = vi.fn()
    toolbox.addEventListener("local-package-test-run", run)
    basics.querySelector("button")!.click()
    expect(run.mock.calls[0][0].detail).toEqual({name: "basics"})
  })
})
