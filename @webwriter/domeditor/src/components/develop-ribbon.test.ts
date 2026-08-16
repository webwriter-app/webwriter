// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import type {WebWriterPackage} from "../packages"
import {AppRibbon} from "./ribbon"
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
})

afterEach(() => document.body.replaceChildren())

describe("Develop ribbon tab", () => {
  it("shows local package actions and selects packages from the drawer select", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Develop"
    ribbon.localPackages = [localPackage("Alpha"), localPackage("Beta")]
    document.body.append(ribbon)
    await ribbon.updateComplete

    expect(Array.from(ribbon.shadowRoot!.querySelectorAll("ribbon-tab"), tab => tab.label))
      .toContain("Develop")
    const drawer = ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Local packages"]')!
    expect((drawer as HTMLElement & {expandable: boolean}).expandable).toBe(false)
    const select = drawer.querySelector<HTMLSelectElement>("select.local-package-select")!
    expect(select).not.toBeNull()
    expect(select.parentElement?.parentElement?.firstElementChild).toBe(select.parentElement)
    expect(select.parentElement?.querySelector(".icon-tabler-package")).not.toBeNull()
    expect(getComputedStyle(select).backgroundColor).toBe("transparent")
    expect(Array.from(select.options, option => option.textContent)).toEqual([
      "@local/alpha",
      "@local/beta",
    ])
    expect(select.value).toBe("@local/alpha")
    expect(drawer.querySelector<RibbonButton>('ribbon-button[label="Load package"]')).not.toBeNull()
    expect(drawer.querySelector<RibbonButton>('ribbon-button[label="New package"]')).not.toBeNull()
    expect(drawer.querySelector("package-search")).toBeNull()
    expect(drawer.querySelectorAll<RibbonButton>('ribbon-button[variant="package"]')).toHaveLength(0)

    const load = drawer.querySelector<RibbonButton>('ribbon-button[label="Load package"]')!
    await load.updateComplete
    expect(load.shadowRoot!.querySelector(".icon-tabler-folder-open")).not.toBeNull()
    const listener = vi.fn()
    ribbon.addEventListener("ribbon-button-click", listener)
    load.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({label: "local-package-add"}),
    }))

    const create = drawer.querySelector<RibbonButton>('ribbon-button[label="New package"]')!
    create.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({label: "local-package-new"}),
    }))

    select.value = "@local/beta"
    select.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    await ribbon.updateComplete
    expect(ribbon.selectedLocalPackageName).toBe("@local/beta")
    expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Metadata"]')).not.toBeNull()
    expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Development"]')).not.toBeNull()
    expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Exports"]')).not.toBeNull()

    const metadata = ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Metadata"]')!
    const metadataChange = vi.fn()
    ribbon.addEventListener("local-package-metadata-change", metadataChange)
    const description = metadata.querySelector<HTMLInputElement>('input[name="description"]')!
    description.value = "Updated description"
    description.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(metadataChange).toHaveBeenCalledWith(expect.objectContaining({
      detail: {field: "description", value: "Updated description"},
    }))

    const development = ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Development"]')!
    const autoReloadChange = vi.fn()
    ribbon.addEventListener("local-package-auto-reload-change", autoReloadChange)
    const autoReload = development.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    autoReload.checked = true
    autoReload.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(autoReloadChange).toHaveBeenCalledWith(expect.objectContaining({detail: {enabled: true}}))
  })

  it("lists the selected package's exports as insert actions", async() => {
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
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Develop"
    ribbon.localPackages = [pkg]
    ribbon.selectedLocalPackageName = pkg.name
    document.body.append(ribbon)
    await ribbon.updateComplete
    const exportButton = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Exports"] ribbon-button[label="Alpha widget"]',
    )!
    const listener = vi.fn()
    ribbon.addEventListener("ribbon-button-click", listener)

    exportButton.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({label: "package-member:local/Alpha@0.0.0-local:./widgets/alpha"}),
    }))
  })
})
