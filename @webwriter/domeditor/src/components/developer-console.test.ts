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
  it("opens Packages by default with activation controls kept in the toolbox", async () => {
    const console = new DeveloperConsole()
    document.body.append(console)
    await console.updateComplete
    expect(console.tab).toBe("Packages")
    expect(console.shadowRoot!.querySelector('#console-tab-Packages[aria-selected="true"]')).not.toBeNull()
    expect(console.shadowRoot!.querySelector(".developer-console-controls")).toBeNull()
  })

  it("places a global auto-reload checkbox at the right end of the tab bar", async () => {
    const console = await mount()
    const label = console.shadowRoot!.querySelector<HTMLLabelElement>(".auto-reload")!
    expect(label.nextElementSibling?.classList.contains("console-pin")).toBe(true)
    const change = vi.fn()
    console.addEventListener("developer-console-auto-reload-change", change)
    const input = label.querySelector<HTMLInputElement>("input")!
    expect(input.checked).toBe(true)
    input.click()
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({detail: {enabled: false}}))
    console.autoReload = false
    await console.updateComplete
    expect(input.checked).toBe(false)
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
    expect(tabs.map(tab => tab.textContent)).toEqual(["Packages", "Tests", "HTML"])
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

  it("shows explicit empty tests and checks", async () => {
    const console = await mount()
    console.localPackages = [{name: "@local/demo", version: "1.0.0", label: "Demo", description: "", authors: [], keywords: [], links: {}, members: [], scripts: [], styles: []}]
    console.tab = "Tests"
    await console.updateComplete
    expect(console.shadowRoot!.querySelector(".test-content")!.textContent).toContain("No problems found")
    expect(console.shadowRoot!.querySelector(".test-content")!.textContent).toContain("No tests defined")

  })
})
