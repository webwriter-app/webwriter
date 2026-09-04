// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import type {WebWriterPackage} from "../packages"
import {DomEditorToolbox} from "./toolbox"
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

describe("Develop toolbox", () => {
  it("shows local package actions and selects packages from the drawer select", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Develop"
    toolbox.activeMenu = "Develop"
    toolbox.localPackages = [localPackage("Alpha"), localPackage("Beta")]
    document.body.append(toolbox)
    await toolbox.updateComplete

    expect(toolbox.shadowRoot!.querySelector('button[data-tool="Develop"]')).not.toBeNull()
    const drawer = toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Local packages"]')!
    expect((drawer as HTMLElement & {expandable: boolean}).expandable).toBe(false)
    await (drawer as HTMLElement & {updateComplete: Promise<unknown>}).updateComplete
    expect((drawer as HTMLElement & {hidePaneLabel: boolean}).hidePaneLabel).toBe(true)
    expect(getComputedStyle(drawer.shadowRoot!.querySelector<HTMLElement>(".pane-label")!).display).toBe("none")
    expect(getComputedStyle(drawer).position).toBe("sticky")
    const select = drawer.querySelector<HTMLSelectElement>("select.local-package-select")!
    expect(select).not.toBeNull()
    expect(select.parentElement?.parentElement?.firstElementChild).toBe(select.parentElement)
    expect(select.parentElement?.querySelector(".icon-tabler-package")).not.toBeNull()
    expect(getComputedStyle(select).backgroundColor).not.toBe("transparent")
    expect(getComputedStyle(select.parentElement!).backgroundColor).not.toBe("transparent")
    expect(Array.from(select.options, option => option.textContent)).toEqual([
      "@local/alpha",
      "@local/beta",
    ])
    expect(select.value).toBe("@local/alpha")
    expect(drawer.querySelector<RibbonButton>('ribbon-button[label="Load"]')).not.toBeNull()
    expect(drawer.querySelector<RibbonButton>('ribbon-button[label="New"]')).not.toBeNull()
    expect(Array.from(drawer.children).slice(0, 3).map(element => element.className)).toEqual([
      "local-package-selection",
      "local-package-actions",
      "develop-field local-package-auto-reload",
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

    select.value = "@local/beta"
    select.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    await toolbox.updateComplete
    expect(toolbox.selectedLocalPackageName).toBe("@local/beta")
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

    const autoReloadChange = vi.fn()
    toolbox.addEventListener("local-package-auto-reload-change", autoReloadChange)
    const autoReload = drawer.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    autoReload.checked = true
    autoReload.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(autoReloadChange).toHaveBeenCalledWith(expect.objectContaining({detail: {enabled: true}}))
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
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Develop"
    toolbox.activeMenu = "Develop"
    toolbox.localPackages = [pkg]
    toolbox.selectedLocalPackageName = pkg.name
    document.body.append(toolbox)
    await toolbox.updateComplete
    const metadata = toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Metadata"]')!
    const card = metadata.querySelector<HTMLElement>('.develop-export-card[data-export-name="./widgets/demo.*"]')!
    expect(card).not.toBeNull()
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
