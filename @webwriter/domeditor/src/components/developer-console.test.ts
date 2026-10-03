// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {DeveloperConsole} from "./developer-console"

afterEach(() => document.body.replaceChildren())

async function mount() {
  const console = new DeveloperConsole()
  console.tab = "HTML"
  document.body.append(console)
  await console.updateComplete
  return console
}

describe("Developer console", () => {
  it("keeps one full-height package list beside the tab bar and greys it out on HTML", async () => {
    const console = new DeveloperConsole()
    document.body.append(console)
    await console.updateComplete
    const sidebar = console.shadowRoot!.querySelector<HTMLElement>(".package-sidebar")!
    const drawer = sidebar.querySelector(".local-packages-drawer")!
    const header = console.shadowRoot!.querySelector("header")!
    expect(getComputedStyle(sidebar).gridColumn).toBe("1")
    expect(getComputedStyle(sidebar).gridRow).toBe("1 / -1")
    expect(getComputedStyle(header).gridColumn).toBe("2")
    expect(sidebar.hasAttribute("inert")).toBe(false)
    expect(console.shadowRoot!.querySelectorAll(".local-packages-drawer")).toHaveLength(1)
    console.shadowRoot!.querySelector<HTMLButtonElement>("#console-tab-Tests")!.click()
    await console.updateComplete
    expect(sidebar.querySelector(".local-packages-drawer")).toBe(drawer)
    expect(sidebar.hasAttribute("inert")).toBe(false)
    console.shadowRoot!.querySelector<HTMLButtonElement>("#console-tab-HTML")!.click()
    await console.updateComplete
    expect(sidebar.querySelector(".local-packages-drawer")).toBe(drawer)
    expect(sidebar.hasAttribute("inert")).toBe(true)
    expect(sidebar.getAttribute("aria-disabled")).toBe("true")
    expect(getComputedStyle(sidebar).opacity).toBe(".5")
    console.shadowRoot!.querySelector<HTMLButtonElement>("#console-tab-Packages")!.click()
    await console.updateComplete
    expect(sidebar.hasAttribute("inert")).toBe(false)
    expect(sidebar.getAttribute("aria-disabled")).toBe("false")
    expect(console.shadowRoot!.querySelector('#console-tab-Packages[aria-selected="true"]')!.textContent).toBe("Metadata")
  })

  it("opens Metadata by default with activation controls kept in the toolbox", async () => {
    const console = new DeveloperConsole()
    document.body.append(console)
    await console.updateComplete
    expect(console.tab).toBe("Packages")
    expect(console.shadowRoot!.querySelector('#console-tab-Packages[aria-selected="true"]')).not.toBeNull()
    expect(console.shadowRoot!.querySelector(".developer-console-controls")).toBeNull()
  })

  it("toggles global auto-reload with a crossed-out icon when disabled", async () => {
    const console = await mount()
    const button = console.shadowRoot!.querySelector<HTMLButtonElement>(".auto-reload")!
    expect(button.getAttribute("aria-label")).toBe("Auto-reload")
    expect(button.textContent?.trim()).toBe("")
    expect(button.querySelector("input")).toBeNull()
    expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
    expect(button.querySelector(".icon-tabler-refresh")).not.toBeNull()
    expect(button.querySelector(".icon-tabler-bolt")).not.toBeNull()
    expect(button.querySelector(".auto-reload-strike")).toBeNull()
    expect(button.nextElementSibling?.classList.contains("console-pin")).toBe(true)
    const change = vi.fn()
    console.addEventListener("developer-console-auto-reload-change", change)
    expect(button.getAttribute("aria-pressed")).toBe("true")
    button.click()
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({detail: {enabled: false}}))
    console.autoReload = false
    await console.updateComplete
    expect(button.getAttribute("aria-pressed")).toBe("false")
    expect(button.querySelector(".auto-reload-strike")?.getAttribute("d")).toBe("M3 21L21 3")
    button.click()
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({detail: {enabled: true}}))
  })

  it("toggles the pin to the right of Auto-reload", async () => {
    const console = await mount()
    const pin = console.shadowRoot!.querySelector<HTMLButtonElement>(".console-pin")!
    expect(pin.querySelector(".icon-tabler-pin")).not.toBeNull()
    const change = vi.fn()
    console.addEventListener("developer-console-pin-change", change)
    pin.click()
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({detail: {pinned: true}}))
    console.pinned = true
    await console.updateComplete
    expect(pin.getAttribute("aria-pressed")).toBe("true")
    pin.click()
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({detail: {pinned: false}}))
  })

  it("switches between three accessible tabs with clicks and keyboard navigation", async () => {
    const console = await mount()
    const root = console.shadowRoot!
    const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(tabs.map(tab => tab.textContent)).toEqual(["Metadata", "Tests & Checks", "HTML"])
    const change = vi.fn()
    console.addEventListener("developer-console-tab-change", change)
    tabs[0].click()
    await console.updateComplete
    expect(console.tab).toBe("Packages")
    expect(change).toHaveBeenCalledWith(expect.objectContaining({detail: {tab: "Packages"}}))
    expect(tabs[0].getAttribute("aria-selected")).toBe("true")
    expect(root.querySelector<HTMLElement>("#console-panel-HTML")!.hidden).toBe(true)
    expect(root.querySelector<HTMLElement>("#console-panel-Packages")!.hidden).toBe(false)
    expect(root.querySelector(".develop-check, .develop-test")).toBeNull()
    tabs[0].dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowRight", bubbles: true}))
    await console.updateComplete
    expect(console.tab).toBe("Tests")
    expect(root.activeElement).toBe(tabs[1])
    expect(root.querySelector(".test-content")!.textContent).toContain("Select a package")
    tabs[1].dispatchEvent(new KeyboardEvent("keydown", {key: "End", bubbles: true}))
    await console.updateComplete
    expect(console.tab).toBe("HTML")
    expect(tabs.map(tab => tab.tabIndex)).toEqual([-1, -1, 0])
  })

  it("keeps a fixed 300px height without a resize handle", async () => {
    const console = await mount()
    expect(getComputedStyle(console).height).toBe("300px")
    expect(console.shadowRoot!.querySelector('[role="separator"]')).toBeNull()
  })

  it("preserves the active tab when the host refuses a stale switch", async () => {
    const console = await mount()
    console.addEventListener("developer-console-tab-change", event => event.preventDefault())
    console.shadowRoot!.querySelector<HTMLButtonElement>("#console-tab-Packages")!.click()
    await console.updateComplete
    expect(console.tab).toBe("HTML")
    expect(console.shadowRoot!.querySelector<HTMLElement>("#console-panel-Packages")!.hidden).toBe(true)
  })

  it("keeps pending HTML visible until Apply or Discard", async () => {
    const console = await mount()
    console.htmlPending = true
    await console.updateComplete
    const root = console.shadowRoot!
    const change = vi.fn()
    const apply = vi.fn()
    const discard = vi.fn()
    console.addEventListener("developer-console-tab-change", change)
    console.addEventListener("html-source-apply", apply)
    console.addEventListener("html-source-discard", discard)
    root.querySelector<HTMLButtonElement>("#console-tab-Packages")!.click()
    root.querySelector<HTMLButtonElement>("#console-tab-HTML")!.dispatchEvent(new KeyboardEvent("keydown", {key: "End", bubbles: true}))
    expect(console.tab).toBe("HTML")
    expect(change).not.toHaveBeenCalled()
    root.querySelector<HTMLButtonElement>(".apply")!.click()
    root.querySelector<HTMLButtonElement>(".discard")!.click()
    expect(apply).toHaveBeenCalledTimes(1)
    expect(discard).toHaveBeenCalledTimes(1)
  })

  it.each(["keep", "discard", "cancel"] as const)("resolves its native pending dialog with %s", async choice => {
    const console = await mount()
    const decision = console.askPendingPackageChanges()
    await console.updateComplete
    await Promise.resolve()
    const dialog = console.shadowRoot!.querySelector<HTMLDialogElement>(".package-changes-dialog")!
    expect(dialog.open).toBe(true)
    const buttons = [...dialog.querySelectorAll<HTMLButtonElement>("button")]
    buttons[choice === "keep" ? 2 : choice === "discard" ? 1 : 0].click()
    expect(await decision).toBe(choice)
    expect(dialog.open).toBe(false)
  })

  it("cancels pending navigation on Escape or disconnect", async () => {
    const console = await mount()
    const decision = console.askPendingPackageChanges()
    await console.updateComplete
    await Promise.resolve()
    console.shadowRoot!.querySelector(".package-changes-dialog")!.dispatchEvent(new Event("cancel", {cancelable: true}))
    expect(await decision).toBe("cancel")
    const next = console.askPendingPackageChanges()
    await console.updateComplete
    await Promise.resolve()
    console.remove()
    expect(await next).toBe("cancel")
  })

  it("shows explicit empty tests and pending checks for packages not yet checked", async () => {
    const console = await mount()
    console.localPackages = [{name: "@local/demo", version: "1.0.0", label: "Demo", description: "", authors: [], keywords: [], links: {}, members: [], scripts: [], styles: []}]
    console.tab = "Tests"
    await console.updateComplete
    expect(console.shadowRoot!.querySelectorAll('.develop-checklist [data-status="pending"]')).toHaveLength(7)
    expect(console.shadowRoot!.querySelector(".test-content")!.textContent).toContain("No tests defined")

  })

  it("moves load errors into checks and badges them even without a selected package", async () => {
    const console = await mount()
    console.localPackageError = "Could not fetch Git repository"
    await console.updateComplete
    expect(console.shadowRoot!.querySelector('.package-sidebar [role="alert"]')).toBeNull()
    expect(console.shadowRoot!.querySelector('#console-tab-Tests .issue-count')?.textContent).toBe("1")
    console.tab = "Tests"
    await console.updateComplete
    expect(console.shadowRoot!.querySelector('.checks-column [role="alert"]')?.textContent).toContain(console.localPackageError)
    console.localPackageError = ""
    await console.updateComplete
    expect(console.shadowRoot!.querySelector(".issue-count")).toBeNull()
  })

  it("includes all failed checks and test failures once and updates the selected package badge", async () => {
    const console = await mount()
    const pkg = {name: "@local/demo", version: "1.0.0", label: "Demo", description: "", authors: [], keywords: [], links: {}, members: [], scripts: [], styles: [], manifest: {name: "@local/demo", version: "1.0.0", exports: {}}, tests: [{name: "basics", scriptUrl: "https://example.test/test.js"}]}
    console.localPackages = [pkg, {...pkg, name: "@local/other", tests: []}]
    console.localPackageWarnings = {[pkg.name]: [{code: "missing-bundle", message: "No usable bundle"}, {code: "missing-export", path: "demo.js", message: "Missing demo.js"}], "@local/other": []}
    console.localPackageError = "Demo has no bundle yet. Build the package to make its exports available."
    console.localPackageTestResults = {[`${pkg.name}/basics`]: {status: "failed", tests: [{id: "1", path: ["fails"], passed: false}, {id: "2", path: ["passes"], passed: true}]}}
    console.tab = "Tests"
    await console.updateComplete
    const root = console.shadowRoot!
    expect(root.querySelector(".issue-count")?.textContent).toBe("3")
    expect(root.querySelector('.checks-column [role="alert"]')).toBeNull()
    expect(root.querySelectorAll('.develop-checklist [data-status="failed"]')).toHaveLength(2)
    expect(root.querySelectorAll('.develop-checklist [data-status="passed"]')).toHaveLength(5)
    expect(root.querySelector('.tests-column .develop-test')).not.toBeNull()
    console.localPackageError = ""
    console.selectedLocalPackageName = "@local/other"
    await console.updateComplete
    expect(root.querySelector(".issue-count")).toBeNull()
    expect(root.querySelectorAll('.develop-checklist [data-status="passed"]')).toHaveLength(7)
  })

  it.each(["error", "timeout"] as const)("counts a test execution %s without failed assertions as an issue", async status => {
    const console = await mount()
    console.localPackages = [{name: "@local/demo", version: "1.0.0", label: "Demo", description: "", authors: [], keywords: [], links: {}, members: [], scripts: [], styles: [], tests: [{name: "basics", scriptUrl: "https://example.test/test.js"}]}]
    console.localPackageTestResults = {"@local/demo/basics": {status, tests: []}}
    await console.updateComplete
    expect(console.shadowRoot!.querySelector(".issue-count")?.textContent).toBe("1")
    console.localPackageTestResults = {"@local/demo/basics": "running"}
    await console.updateComplete
    expect(console.shadowRoot!.querySelector(".issue-count")).toBeNull()
  })
})
