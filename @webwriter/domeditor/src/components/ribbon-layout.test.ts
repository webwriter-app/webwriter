// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {AppRibbon} from "./ribbon"
import type {RibbonButton} from "./ribbon-button"
import type {RibbonDrawer} from "./ribbon-drawer"
import {contextDrawerPolicy} from "./ribbon-menu-config"

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("element drawer without layout presets", () => {
  it("uses five columns and keeps Formula in the marks drawer", async () => {
    const ribbon = new AppRibbon()
    document.body.append(ribbon)
    await ribbon.updateComplete
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Elements"]')!
    await drawer.updateComplete
    expect(drawer.expandable).toBe(false)
    expect(drawer.layoutWidths.expanded).toBeCloseTo(298.4)
    expect(getComputedStyle(drawer.shadowRoot!.querySelector(".elements-primary-controls")!).gridTemplateColumns)
      .toBe("repeat(5, minmax(0, 1fr))")
    expect(drawer.querySelector('.layout-opener, .layout-gallery, ribbon-button[label="Formula"]')).toBeNull()
    expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Marks"] ribbon-button[label="Formula"]')).not.toBeNull()
  })

  it.each(["grid", "flex", "columns"] as const)("does not offer old layout controls for %s content", kind => {
    const groups = contextDrawerPolicy({menu: "Edit", surface: "toolbox", activeTool: "Edit", layout: kind, attributes: true})
    expect(groups.map(group => group.label)).toEqual(["Attributes"])
  })
})


describe("preview reader drawer", () => {
  const mount = async (live = false) => {
    const ribbon = new AppRibbon()
    ribbon.previewActive = true
    ribbon.liveSessionActive = live
    ribbon.liveSessionLink = live ? "https://webwriter.app/read/session" : ""
    document.body.append(ribbon)
    await ribbon.updateComplete
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[layout="learners"]')!
    await drawer.updateComplete
    return {ribbon, drawer}
  }

  it("places a horizontal sharing bar above learners and keeps it expanded at narrow widths", async () => {
    const {ribbon, drawer} = await mount(true)
    ribbon.liveLearners = [{id: "ada", name: "Ada", initials: "AL", color: "#123456", connected: true, enabled: true}]
    await ribbon.updateComplete
    const bar = drawer.querySelector<HTMLElement>(".reader-sharing-bar")!
    expect(Array.from(bar.children, item => item.className)).toEqual([
      "live-session-switch", "session-share", "reader-link-popup",
    ])
    const toggle = bar.querySelector<HTMLInputElement>('input[role="switch"]')!
    expect(toggle.getAttribute("aria-label")).toBe("Share")
    expect(toggle.checked).toBe(true)
    expect(getComputedStyle(toggle.closest("label")!).flexDirection).toBe("row")
    expect(bar.nextElementSibling?.querySelector('[data-learner-id="ada"]')).not.toBeNull()
    expect(drawer.querySelector('[slot="more"]')).toBeNull()
    expect(drawer.expandable).toBe(false)
    const content = ribbon.shadowRoot!.querySelector<HTMLElement>(".ribbon-content")!
    Object.defineProperty(content, "clientWidth", {configurable: true, value: 320})
    const drawers = Array.from(content.querySelectorAll<RibbonDrawer>("ribbon-drawer"))
    ribbon.setAttribute("drawers-collapsed", "")
    ;(ribbon as any).updateResponsiveLayout(drawers)
    expect(ribbon.hasAttribute("drawers-collapsed")).toBe(false)
    expect(drawers.every(item => !item.collapsed && !item.compact)).toBe(true)
    expect(drawers.map(item => item.layout)).toEqual(["learners", "sharing-preview"])
    expect(drawers[1].layoutWidths.expanded).toBe(72)
    expect(getComputedStyle(drawer).flex).toBe("1 1 0px")
    const changes = vi.fn()
    ribbon.addEventListener("live-session-toggle", changes)
    toggle.click()
    expect(changes.mock.calls[0][0].detail).toEqual({enabled: false})
    const learnerChanges = vi.fn()
    ribbon.addEventListener("live-learner-toggle", learnerChanges)
    drawer.querySelector<HTMLButtonElement>(".learner-toggle")!.click()
    expect(learnerChanges.mock.calls[0][0].detail).toEqual({id: "ada", enabled: false})
  })

  it("copies the reader link and opens QR and link popovers with the same session URL", async () => {
    const {ribbon, drawer} = await mount(true)
    const copy = vi.spyOn(ribbon as any, "copyReaderSharing").mockResolvedValue(undefined)
    const field = drawer.querySelector<HTMLInputElement>('.session-share > .sharing-link-field input')!
    expect(field.value).toBe(ribbon.liveSessionLink)
    expect(field.readOnly).toBe(true)
    drawer.querySelector<HTMLButtonElement>('.session-share > .sharing-link-field button')!.click()
    await vi.waitFor(() => expect(copy).toHaveBeenCalledWith(ribbon.liveSessionLink))
    for(const selector of [".session-share", ".reader-link-popup"]) {
      const button = drawer.querySelector<RibbonButton>(selector)!
      await button.updateComplete
      button.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
      await button.updateComplete
      const menu = button.shadowRoot!.querySelector("ribbon-menu")!
      expect(button.dropdownNoScroll).toBe(true)
      if(selector === ".session-share") {
        expect(menu.querySelector("input")).toBeNull()
        expect(button.querySelector(".sharing-link-field")!.getAttribute("slot")).toBe("trailing")
        expect(button.shadowRoot!.querySelector('slot[name="trailing"]')).not.toBeNull()
        expect(Array.from(menu.querySelectorAll(".sharing-dropdown-action"), item => item.textContent!.trim()))
          .toEqual(["Download QR code", "Copy QR code"])
        expect(button.label).toBe("QR")
        expect(button.iconOnly).toBe(true)
        expect(button.shadowRoot!.querySelector(".main-button")!.getAttribute("aria-label")).toBe("QR")
        expect(getComputedStyle(button.shadowRoot!.querySelector(".button-label")!).display).toBe("none")
        expect(getComputedStyle(button.shadowRoot!.querySelector(".button-icon")!).width).toBe("25.6px")
        expect((menu.querySelector("webwriter-qr-code") as any).value).toBe(ribbon.liveSessionLink)
      }
      else expect(menu.querySelector<HTMLInputElement>("input")!.value).toBe(ribbon.liveSessionLink)
    }
  })

  it("exports and copies the QR image from the open sharing menu", async () => {
    const {drawer} = await mount(true)
    const button = drawer.querySelector<RibbonButton>(".session-share")!
    await button.updateComplete
    button.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    await button.updateComplete
    const menu = button.shadowRoot!.querySelector("ribbon-menu")!
    const qr = menu.querySelector("webwriter-qr-code") as import("./qr-code").QRCodeElement
    const blob = new Blob(["qr"], {type: "image/png"})
    vi.spyOn(qr, "toBlob").mockResolvedValue(blob)
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:qr-image")
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
    const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    const write = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("navigator", {clipboard: {write}})
    vi.stubGlobal("ClipboardItem", class {
      constructor(public data: Record<string, Blob>) {}
    })
    menu.querySelectorAll<HTMLButtonElement>(".sharing-dropdown-action")[0].click()
    await vi.waitFor(() => expect(download).toHaveBeenCalledOnce())
    expect(create).toHaveBeenCalledWith(blob)
    expect(revoke).toHaveBeenCalledWith("blob:qr-image")
    expect((download.mock.instances[0] as HTMLAnchorElement).download).toBe("webwriter-qr-code.png")
    menu.querySelectorAll<HTMLButtonElement>(".sharing-dropdown-action")[1].click()
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce())
    expect(write.mock.calls[0][0][0].data["image/png"]).toBe(blob)
    expect(button.notification).toBe("Copied QR code")
    expect(button.shadowRoot!.querySelector(".main-button")!.getAttribute("aria-expanded")).toBe("true")
  })

  it("keeps sharing closed on enable and copies HTML, PNG, and plain text once the link is ready", async () => {
    const {ribbon, drawer} = await mount()
    const png = new Blob(["qr-image"], {type: "image/png"})
    vi.spyOn(ribbon as any, "sharingQRCodeBlob").mockResolvedValue(png)
    vi.stubGlobal("ClipboardItem", class {
      constructor(public data: Record<string, Promise<Blob>>) {}
    })
    const write = vi.fn(async (items: Array<{data: Record<string, Promise<Blob>>}>) => {
      await Promise.all(Object.values(items[0].data))
    })
    vi.stubGlobal("navigator", {clipboard: {write}})
    const toggle = drawer.querySelector<HTMLInputElement>('input[role="switch"]')!
    toggle.click()
    ribbon.liveSessionActive = true
    await ribbon.updateComplete
    expect(write).not.toHaveBeenCalled()
    ribbon.liveSessionLink = "https://webwriter.app/read/session?one=1&two=2"
    await ribbon.updateComplete
    const button = drawer.querySelector<RibbonButton>(".session-share")!
    await vi.waitFor(() => expect(button.notification).toBe("Link and QR code copied!"))
    expect(button.shadowRoot!.querySelector(".main-button")!.getAttribute("aria-expanded")).toBe("false")
    const data = write.mock.calls[0][0][0].data
    expect(Object.keys(data)).toEqual(["text/html", "image/png", "text/plain"])
    expect(await data["image/png"]).toBe(png)
    expect(await (await data["text/plain"]).text()).toBe(ribbon.liveSessionLink)
    const html = document.createElement("div")
    html.innerHTML = await (await data["text/html"]).text()
    expect(html.querySelector("a")!.href).toBe(ribbon.liveSessionLink)
    expect(html.querySelector("a")!.textContent).toBe(ribbon.liveSessionLink)
    expect(html.querySelector("img")!.src).toMatch(/^data:image\/png;base64,/)
    await button.updateComplete
    const bubble = button.shadowRoot!.querySelector(".button-notification")!
    expect(bubble.getAttribute("popover")).toBe("manual")
    expect(bubble.getAttribute("aria-hidden")).toBe("false")
    ribbon.liveLearners = [{id: "ada", name: "Ada", initials: "AL", color: "#123456", connected: true, enabled: true}]
    await ribbon.updateComplete
    expect(write).toHaveBeenCalledOnce()
    drawer.querySelector<HTMLButtonElement>('.session-share > .sharing-link-field button')!.click()
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2))
    await Promise.all(Object.values(write.mock.calls[1][0][0].data))
  })

  it("shows a failure hint if the clipboard rejects the combined copy", async () => {
    const {ribbon, drawer} = await mount(true)
    vi.spyOn(ribbon as any, "readerSharingClipboardData").mockResolvedValue({
      "text/html": new Blob(["<a>link</a>"], {type: "text/html"}),
      "image/png": new Blob(["qr"], {type: "image/png"}),
      "text/plain": new Blob([ribbon.liveSessionLink], {type: "text/plain"}),
    })
    vi.stubGlobal("ClipboardItem", class {
      constructor(public data: Record<string, Promise<Blob>>) {}
    })
    vi.stubGlobal("navigator", {clipboard: {write: vi.fn().mockRejectedValue(new Error("Denied"))}})
    drawer.querySelector<HTMLButtonElement>('.session-share > .sharing-link-field button')!.click()
    const button = drawer.querySelector<RibbonButton>(".session-share")!
    await vi.waitFor(() => expect(button.notification).toBe("Could not copy link and QR code"))
  })

  it("cancels automatic copying when sharing is switched off before a link arrives", async () => {
    const {ribbon, drawer} = await mount()
    const copy = vi.spyOn(ribbon as any, "copyReaderSharing").mockResolvedValue(undefined)
    const toggle = drawer.querySelector<HTMLInputElement>('input[role="switch"]')!
    toggle.click()
    ribbon.liveSessionActive = true
    await ribbon.updateComplete
    toggle.click()
    ribbon.liveSessionActive = false
    ribbon.liveSessionLink = "https://webwriter.app/read/session"
    await ribbon.updateComplete
    expect(copy).not.toHaveBeenCalled()
  })

  it("disables link controls until a live reader link is available", async () => {
    const {drawer} = await mount()
    expect(drawer.querySelector<HTMLInputElement>(".sharing-link-input")!.disabled).toBe(true)
    expect(drawer.querySelector<RibbonButton>(".session-share")!.disabled).toBe(true)
    expect(drawer.querySelector<RibbonButton>(".reader-link-popup")!.disabled).toBe(true)
    expect(drawer.querySelector("webwriter-qr-code")).toBeNull()
  })
})
