// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import type {WebWriterPackage} from "../packages"
import {DocumentHeadCombobox} from "./document-head-editor"
import {packageLicenseOptions} from "../package-licenses"
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
  it.each([false, true])("only offers console pinning when pinned is %s", async pinned => {
    const console = new DeveloperConsole()
    console.pinned = pinned
    document.body.append(console)
    await console.updateComplete
    expect(console.shadowRoot!.querySelector(".document-pin")).toBeNull()
    expect(console.shadowRoot!.querySelector(".console-pin")).not.toBeNull()
  })

  it("shows a spinner only for packages being refreshed and restores the reload icon afterward", async () => {
    const console = new DeveloperConsole()
    const first = localPackage("First")
    const second = localPackage("Second")
    console.localPackages = [first, second]
    document.body.append(console)
    await console.updateComplete
    const buttons = [...console.shadowRoot!.querySelectorAll<HTMLButtonElement>(".local-package-refresh")]
    console.localPackageRefreshingNames = [first.name]
    await console.updateComplete
    expect(buttons[0].getAttribute("aria-busy")).toBe("true")
    expect(buttons[0].disabled).toBe(true)
    expect(buttons[0].querySelector(".package-refresh-spinner")).not.toBeNull()
    expect(buttons[0].querySelector("svg")).toBeNull()
    expect(buttons[1].getAttribute("aria-busy")).toBe("false")
    expect(buttons[1].disabled).toBe(false)
    expect(buttons[1].querySelector("svg")).not.toBeNull()
    expect(console.shadowRoot!.querySelector(".auto-reload .package-refresh-spinner")).toBeNull()
    console.localPackageRefreshingNames = []
    await console.updateComplete
    expect(buttons[0].disabled).toBe(false)
    expect(buttons[0].querySelector(".package-refresh-spinner")).toBeNull()
    expect(buttons[0].querySelector("svg")).not.toBeNull()
  })

  it("shows per-package refresh and source controls and disables Git content editing", async () => {
    const toolbox = new DeveloperConsole()
    const local = {...localPackage("Local"), iconUrl: "https://example.test/icon.svg", developerSource: {kind: "local" as const, path: "widget-folder"}}
    const git = {...localPackage("Git"), developerSource: {kind: "git" as const, repository: "https://gitlab.example/widgets.git", ref: "v1.0.0", path: "packages/widget", commit: "abc123"}}
    toolbox.localPackages = [local, git]
    toolbox.selectedLocalPackageName = git.name
    document.body.append(toolbox)
    await toolbox.updateComplete
    const root = toolbox.shadowRoot!
    const items = root.querySelectorAll(".local-package-list li")
    expect(items[0].querySelector(".package-source-popup")!.textContent).toContain("widget-folder")
    expect(items[1].querySelector(".package-source-popup")!.textContent).toContain(git.developerSource.repository)
    expect(items[1].querySelector(".local-package-source .icon-tabler-git-branch")).not.toBeNull()
    expect(items[0].querySelector(".local-package-source .icon-tabler-folder-open")).not.toBeNull()
    expect(items[0].querySelector<HTMLImageElement>(".local-package-icon img")!.src).toBe(local.iconUrl)
    expect(items[1].querySelector(".local-package-icon svg")).not.toBeNull()
    const sourceIcon = items[1].querySelector<HTMLElement>(".local-package-source")!
    expect(sourceIcon.tagName).toBe("SPAN")
    const stack = sourceIcon.parentElement!
    expect(stack.classList.contains("local-package-icon-stack")).toBe(true)
    expect(stack.querySelector(".local-package-icon")).not.toBeNull()
    expect(getComputedStyle(stack).top).toBe("50%")
    expect(getComputedStyle(stack).transform).toBe("translateY(-50%)")
    expect(getComputedStyle(sourceIcon).right).toBe("-4px")
    expect(getComputedStyle(sourceIcon).top).toBe("-4px")
    expect(getComputedStyle(sourceIcon).borderRadius).toBe("50%")
    const popup = items[1].querySelector<HTMLElement>(".package-source-popup")!
    popup.showPopover = vi.fn()
    popup.hidePopover = vi.fn()
    sourceIcon.dispatchEvent(new MouseEvent("mouseenter"))
    expect(popup.showPopover).toHaveBeenCalled()
    sourceIcon.dispatchEvent(new MouseEvent("mouseleave"))
    expect(popup.hidePopover).toHaveBeenCalled()
    sourceIcon.dispatchEvent(new FocusEvent("focus"))
    expect(popup.showPopover).toHaveBeenCalledTimes(2)
    const listener = vi.fn()
    toolbox.addEventListener("ribbon-button-click", listener)
    items[1].querySelector<HTMLButtonElement>(".local-package-refresh")!.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {label: `local-package-refresh:${git.name}`}}))
    const refresh = items[1].querySelector<HTMLButtonElement>(".local-package-refresh")!
    const remove = items[1].querySelector<HTMLButtonElement>(".local-package-remove")!
    expect(getComputedStyle(refresh).bottom).toBe("2.4px")
    expect(getComputedStyle(remove).top).toBe("2.4px")
    expect(getComputedStyle(remove).right).toBe("3.2px")
    remove.click()
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({detail: {label: `local-package-remove:${git.name}`}}))
    expect(toolbox.selectedLocalPackageName).toBe(git.name)
    expect(root.querySelector<HTMLFieldSetElement>(".develop-fields")!.disabled).toBe(true)
    expect(root.querySelector<HTMLInputElement>('input[name="name"]')!.closest("fieldset")!.disabled).toBe(true)
    expect(root.querySelector<HTMLButtonElement>('[aria-label="Create export"]')!.closest("fieldset")!.disabled).toBe(true)
    const details = root.querySelector<HTMLDetailsElement>(".develop-export-details")!
    details.open = true
    expect(details.open).toBe(true)
    toolbox.selectedLocalPackageName = local.name
    await toolbox.updateComplete
    expect(root.querySelector<HTMLFieldSetElement>(".develop-fields")!.disabled).toBe(false)
    toolbox.localPackagesLoading = true
    await toolbox.updateComplete
    expect(root.querySelector<HTMLButtonElement>(".local-package-refresh")!.disabled).toBe(true)
    expect(root.querySelector<HTMLButtonElement>(".local-package-remove")!.disabled).toBe(true)
  })

  it("offers a Git source dialog and submits repository, ref and package folder", async () => {
    const toolbox = new DeveloperConsole()
    document.body.append(toolbox)
    await toolbox.updateComplete
    const load = toolbox.shadowRoot!.querySelector<RibbonButton>('ribbon-button[label="Add package"]')!
    expect(load.submenu).toEqual(expect.arrayContaining([expect.objectContaining({label: "Add from Git repository", action: "git-package-add"})]))
    const dialog = toolbox.shadowRoot!.querySelector<HTMLDialogElement>(".git-package-dialog")!
    const show = vi.spyOn(dialog, "showModal").mockImplementation(() => {dialog.open = true})
    load.dispatchEvent(new CustomEvent("ribbon-button-click", {detail: {label: "git-package-add"}, bubbles: true, composed: true}))
    expect(show).toHaveBeenCalled()
    dialog.querySelector<HTMLInputElement>('[name="repository"]')!.value = "https://github.com/example/demo.git"
    dialog.querySelector<HTMLInputElement>('[name="ref"]')!.value = "v2.0.0"
    dialog.querySelector<HTMLInputElement>('[name="path"]')!.value = "packages/demo"
    const listener = vi.fn()
    toolbox.addEventListener("git-package-load", listener)
    dialog.querySelector("form")!.dispatchEvent(new Event("submit", {bubbles: true, cancelable: true}))
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {repository: "https://github.com/example/demo.git", ref: "v2.0.0", path: "packages/demo"}}))
    expect(dialog.open).toBe(false)
  })

  it("offers the SPDX license list with common software licenses first and accepts custom values", async () => {
    const console = new DeveloperConsole()
    console.localPackages = [localPackage("Alpha")]
    document.body.append(console)
    await console.updateComplete
    const picker = console.shadowRoot!.querySelector<DocumentHeadCombobox>('document-head-combobox[label="License"]')!
    await picker.updateComplete
    expect(picker.options).toBe(packageLicenseOptions)
    expect(picker.options.length).toBeGreaterThan(700)
    expect(picker.options.slice(0, 6).map(option => option.value)).toEqual(["MIT", "Apache-2.0", "BSD-3-Clause", "BSD-2-Clause", "ISC", "MPL-2.0"])
    const separator = picker.options.findIndex(option => option.dividerBefore)
    expect(separator).toBeGreaterThan(5)
    expect(picker.options.filter(option => option.dividerBefore)).toHaveLength(1)
    const rest = picker.options.slice(separator).map(option => option.value)
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, "en", {sensitivity: "base"})))
    expect(new Set(picker.options.map(option => option.value)).size).toBe(picker.options.length)
    const changes = vi.fn()
    console.addEventListener("local-package-metadata-change", changes)
    picker.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.click()
    await picker.updateComplete
    expect(picker.shadowRoot!.querySelectorAll('[role="separator"]')).toHaveLength(1)
    const apache = [...picker.shadowRoot!.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(option => option.title.startsWith("Apache-2.0"))!
    apache.click()
    expect(changes).toHaveBeenLastCalledWith(expect.objectContaining({detail: {field: "license", value: "Apache-2.0"}}))
    await picker.updateComplete
    const input = picker.shadowRoot!.querySelector<HTMLInputElement>("input")!
    input.value = "My custom license"
    input.dispatchEvent(new Event("input", {bubbles: true, composed: true}))
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))
    expect(changes).toHaveBeenLastCalledWith(expect.objectContaining({detail: {field: "license", value: "My custom license"}}))
    console.localPackages = [{...console.localPackages[0], developerSource: {kind: "git", repository: "https://example.test/pkg.git", ref: "main", path: "", commit: "abc"}}]
    await console.updateComplete
    await picker.updateComplete
    expect(input.disabled).toBe(true)
  })

  it("keeps keywords collapsed with an immutable first keyword and adds entries with Enter or its inset button", async () => {
    const console = new DeveloperConsole()
    const pkg = localPackage("Alpha")
    pkg.manifest!.keywords = ["alpha", "webwriter-widget", "beta", "alpha"]
    console.localPackages = [pkg]
    document.body.append(console)
    await console.updateComplete
    const details = console.shadowRoot!.querySelector<HTMLDetailsElement>(".develop-compact-details")!
    expect(details.open).toBe(false)
    expect(details.querySelector("textarea")).toBeNull()
    const entries = [...details.querySelectorAll(".develop-keyword-entry")]
    expect(entries.map(entry => entry.querySelector("span")!.textContent)).toEqual(["webwriter-widget", "alpha", "beta"])
    expect(entries[0].classList.contains("required")).toBe(true)
    expect(entries[0].querySelector("button")).toBeNull()
    const changes = vi.fn()
    const pendingInput = vi.fn()
    console.addEventListener("local-package-keyword-change", changes)
    console.addEventListener("local-package-pending-input", pendingInput)
    details.open = true
    const input = details.querySelector<HTMLInputElement>('[name="newKeyword"]')!
    input.value = " new-keyword "
    input.dispatchEvent(new Event("input", {bubbles: true}))
    expect(pendingInput).not.toHaveBeenCalled()
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))
    expect(changes).toHaveBeenLastCalledWith(expect.objectContaining({detail: {operation: "add", value: "new-keyword"}}))
    expect(input.value).toBe("")
    input.value = "button-keyword"
    details.querySelector<HTMLButtonElement>('[aria-label="Add keyword"]')!.click()
    expect(changes).toHaveBeenLastCalledWith(expect.objectContaining({detail: {operation: "add", value: "button-keyword"}}))
    expect(input.value).toBe("")
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}))
    expect(changes).toHaveBeenCalledTimes(2)
    entries[1].querySelector<HTMLButtonElement>("button")!.click()
    expect(changes).toHaveBeenLastCalledWith(expect.objectContaining({detail: {operation: "remove", value: "alpha"}}))
    await console.updateComplete
    expect(details.open).toBe(true)
  })

  it("places package editing fields in Package and member settings inside collapsed exports", async () => {
    const toolbox = new DeveloperConsole()
    const pkg = localPackage("Alpha")
    pkg.manifest!.editingConfig = {
      ".": {label: {en: "Package label"}, description: "Package description"},
      "./widgets/demo.*": {label: "Member label", inline: false, marks: "", sharedData: true},
    }
    toolbox.localPackages = [pkg]
    document.body.append(toolbox)
    await toolbox.updateComplete
    const root = toolbox.shadowRoot!
    expect(root.querySelector("#develop-editing-fields")).toBeNull()
    expect(root.querySelectorAll('.develop-fields > .develop-section')).toHaveLength(2)
    const packageSection = root.querySelector('[aria-labelledby="develop-package-fields"]')!
    const label = packageSection.querySelector<HTMLInputElement>('[data-editing-option="label"]')!
    expect(JSON.parse(label.value)).toEqual({en: "Package label"})
    expect(packageSection.querySelectorAll("[data-editing-option]")).toHaveLength(2)
    const exportCard = root.querySelector<HTMLDetailsElement>('.develop-export-details')!
    expect(exportCard.open).toBe(false)
    expect(exportCard.querySelectorAll('.develop-export-card-fields [data-editing-option]')).toHaveLength(10)
    const inline = exportCard.querySelector<HTMLSelectElement>('[data-editing-option="inline"]')!
    expect(inline.value).toBe("false")
    const changes = vi.fn()
    toolbox.addEventListener("local-package-editing-option-change", changes)
    label.value = "Updated package"
    label.dispatchEvent(new Event("change", {bubbles: true}))
    inline.value = "true"
    inline.dispatchEvent(new Event("change", {bubbles: true}))
    expect(changes).toHaveBeenNthCalledWith(1, expect.objectContaining({detail: {key: ".", option: "label", value: "Updated package"}}))
    expect(changes).toHaveBeenNthCalledWith(2, expect.objectContaining({detail: {key: "./widgets/demo", option: "inline", value: "true"}}))
  })

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
      const columns = Array.from(drawer.querySelectorAll<HTMLElement>(".develop-section"))
      Object.defineProperty(drawer, "clientHeight", {configurable: true, value: 240})
      columns.forEach((column, index) => Object.defineProperty(column, "offsetHeight", {value: index ? 100 : 400}))
      const observer = instances.find(instance => instance.observe.mock.calls.some(([element]) => element === drawer))!
      observer.callback([], observer as unknown as ResizeObserver)
      expect(columns[0].style.getPropertyValue("--column-sticky-top")).toBe("-168px")
      expect(columns[1].style.getPropertyValue("--column-sticky-top")).toBe("0px")
      Object.defineProperty(drawer, "clientHeight", {value: 500})
      observer.callback([], observer as unknown as ResizeObserver)
      expect(columns[0].style.getPropertyValue("--column-sticky-top")).toBe("0px")
      toolbox.packageDraft = {...toolbox.localPackages[0].manifest, description: "Pending description"}
      await toolbox.updateComplete
      const bar = toolbox.shadowRoot!.querySelector<HTMLElement>(".package-pending-bar")!
      Object.defineProperty(bar, "offsetHeight", {value: 40})
      Object.defineProperty(drawer, "clientHeight", {value: 240})
      const pendingObserver = [...instances].reverse().find(instance => instance.observe.mock.calls.some(([element]) => element === drawer))!
      pendingObserver.callback([], pendingObserver as unknown as ResizeObserver)
      expect(drawer.style.getPropertyValue("--package-pending-height")).toBe("40px")
      expect(columns[0].style.getPropertyValue("--column-sticky-top")).toBe("-208px")
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
    expect(drawer.querySelector<RibbonButton>('ribbon-button[label="Add package"]')).not.toBeNull()
    expect(drawer.querySelectorAll(".local-package-actions > ribbon-button")).toHaveLength(1)
    expect(Array.from(drawer.children).slice(0, 2).map(element => element.className)).toEqual([
      "local-package-list",
      "local-package-actions",
    ])
    expect(drawer.querySelector("package-search")).toBeNull()
    expect(drawer.querySelectorAll<RibbonButton>('ribbon-button[variant="package"]')).toHaveLength(0)

    const load = drawer.querySelector<RibbonButton>('ribbon-button[label="Add package"]')!
    await load.updateComplete
    expect(load.getAttribute("variant")).toBe("toolbar")
    expect(getComputedStyle(load.shadowRoot!.querySelector<HTMLElement>(".main-button")!).flexDirection).toBe("row")
    expect(load.shadowRoot!.querySelector(".icon-tabler-plus")).not.toBeNull()
    const listener = vi.fn()
    toolbox.addEventListener("ribbon-button-click", listener)
    load.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({label: "local-package-add"}),
    }))

    expect(load.submenu).toEqual([
      {label: "Add from local folder", action: "local-package-add", icon: "Open"},
      {label: "Add from Git repository", action: "git-package-add", icon: "Git"},
      {label: "Create new package", action: "local-package-new", icon: "PackagePlus"},
    ])
    expect(getComputedStyle(load.shadowRoot!.querySelector<HTMLElement>(".main-button")!).justifyContent).toBe("flex-start")
    const chevron = load.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!
    expect(getComputedStyle(chevron).position).toBe("static")
    expect(getComputedStyle(chevron).aspectRatio).toBe("1 / 1")
    chevron.click()
    await load.updateComplete
    const menu = load.shadowRoot!.querySelector("ribbon-menu")!
    await menu.updateComplete
    expect(menu.shadowRoot!.querySelector('[title="Create new package"] .icon-tabler-cube-plus')).not.toBeNull()
    menu.shadowRoot!.querySelector<HTMLButtonElement>('[title="Create new package"]')!.click()
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
      "name", "version", "description", "newKeyword", "author", "exportName", "exportName", "customElements",
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
      expect(card.querySelectorAll(".develop-export-card-fields input, .develop-export-card-fields select")).toHaveLength(13)
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
  it("shows runtime checks as pending until inspected, then passed or failed", async () => {
    const console = new DeveloperConsole()
    console.tab = "Tests"
    const pkg: WebWriterPackage = {...localPackage("Alpha"), members: [{id: "demo", packageName: "@local/alpha", packageVersion: "0.0.0-local", exportName: "./widgets/demo", kind: "widget", label: "Demo", insertable: true, tagName: "demo-widget"}]}
    console.localPackages = [pkg]
    console.localPackageWarnings = {[pkg.name]: []}
    document.body.append(console)
    await console.updateComplete
    const root = console.shadowRoot!
    expect(root.querySelectorAll('.develop-checklist [data-status="passed"]')).toHaveLength(7)
    expect(root.querySelectorAll('.develop-checklist [data-status="pending"]')).toHaveLength(2)
    console.localPackageRuntimeWarnings = {[pkg.name]: []}
    await console.updateComplete
    expect(root.querySelectorAll('.develop-checklist [data-status="passed"]')).toHaveLength(9)
    expect(root.querySelectorAll('.develop-checklist [data-status="pending"]')).toHaveLength(0)
    const warning = {code: "undefined-widget" as const, message: "Demo widget was not registered"}
    console.localPackageRuntimeWarnings = {[pkg.name]: [warning]}
    console.localPackageWarnings = {[pkg.name]: [warning]}
    await console.updateComplete
    expect(root.querySelectorAll('.develop-checklist [data-status="passed"]')).toHaveLength(8)
    expect(root.querySelector('.develop-checklist [data-status="failed"]')?.textContent).toContain(warning.message)
    expect(root.querySelector(".issue-count")?.textContent).toBe("1")
  })

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
    expect(drawer.querySelector('.develop-checklist [data-status="failed"]')?.textContent).toContain("unknown option 'selectable'")
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
