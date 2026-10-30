// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import "./breadcrumb"
import type {DomEditorBreadcrumb} from "./breadcrumb"
import "./ribbon-menu"
import type {RibbonMenu} from "./ribbon-menu"
import {getElementPresentation} from "../element-names"

afterEach(() => {
  document.querySelectorAll("dom-editor-breadcrumb").forEach(element => element.remove())
  vi.unstubAllGlobals()
})

describe("generic element icons", () => {
  it.each(["section", "div", "figure", "template", "unfamiliar"])("uses square-dashed for %s in the selection path", async tag => {
    const breadcrumb = document.createElement("dom-editor-breadcrumb") as DomEditorBreadcrumb
    breadcrumb.path = [{path: [0], ...getElementPresentation(tag)}]
    document.body.append(breadcrumb)
    await breadcrumb.updateComplete
    expect(breadcrumb.shadowRoot!.querySelector(".icon-tabler-square-dashed")).not.toBeNull()
    expect(breadcrumb.shadowRoot!.querySelector(".icon-tabler-section")).toBeNull()
  })

  it("retains the dedicated paragraph icon", async () => {
    const breadcrumb = document.createElement("dom-editor-breadcrumb") as DomEditorBreadcrumb
    breadcrumb.path = [{path: [0], ...getElementPresentation("p")}]
    document.body.append(breadcrumb)
    await breadcrumb.updateComplete
    expect(breadcrumb.shadowRoot!.querySelector(".icon-tabler-pilcrow")).not.toBeNull()
  })
})

describe("breadcrumb float indicators", () => {
  it.each(["left", "right"] as const)("uses the float-%s icon", async direction => {
    const breadcrumb = document.createElement("dom-editor-breadcrumb") as DomEditorBreadcrumb
    breadcrumb.path = [{path: [0], name: "Image", float: direction === "left" ? "far-left" : "far-right"}]
    document.body.append(breadcrumb)
    await breadcrumb.updateComplete
    const indicator = breadcrumb.shadowRoot!.querySelector(".position-float")!
    expect(indicator.getAttribute("aria-label")).toBe(direction === "left" ? "Left float" : "Right float")
    expect(indicator.querySelector(`.icon-tabler-float-${direction}`)).not.toBeNull()
  })
})

describe("image hotspot breadcrumb indicator", () => {
  it("places a hand click indicator beside the Image label", async () => {
    const breadcrumb = document.createElement("dom-editor-breadcrumb") as DomEditorBreadcrumb
    breadcrumb.path = [{path: [0], name: "Image", imageMap: true}]
    document.body.append(breadcrumb)
    await breadcrumb.updateComplete
    const label = breadcrumb.shadowRoot!.querySelector(".item-label")!
    const indicator = breadcrumb.shadowRoot!.querySelector(".image-hotspot-indicator")!
    expect(label.textContent).toBe("Image")
    expect(indicator.getAttribute("aria-label")).toBe("Interactive image hotspots")
    expect(indicator.querySelector("svg")).not.toBeNull()
    breadcrumb.path = [{path: [0], name: "Image"}]
    await breadcrumb.updateComplete
    expect(breadcrumb.shadowRoot!.querySelector(".image-hotspot-indicator")).toBeNull()
    breadcrumb.remove()
  })
})

describe("breadcrumb resize lifecycle", () => {
  it("observes the navigation again when the same element reconnects", async () => {
    const observers: Array<{
      observe: ReturnType<typeof vi.fn>
      disconnect: ReturnType<typeof vi.fn>
    }> = []
    class ResizeObserverStub {
      observe = vi.fn()
      disconnect = vi.fn()
      unobserve = vi.fn()
      takeRecords = () => []

      constructor(_callback: ResizeObserverCallback) {
        observers.push(this)
      }
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub)

    const breadcrumb = document.createElement("dom-editor-breadcrumb") as DomEditorBreadcrumb
    document.body.append(breadcrumb)
    await breadcrumb.updateComplete

    expect(observers).toHaveLength(1)
    expect(observers[0].observe).toHaveBeenCalledWith(breadcrumb.shadowRoot!.querySelector("nav"))

    breadcrumb.remove()
    expect(observers[0].disconnect).toHaveBeenCalledOnce()

    document.body.append(breadcrumb)

    expect(observers).toHaveLength(2)
    expect(observers[1].observe).toHaveBeenCalledWith(breadcrumb.shadowRoot!.querySelector("nav"))
    breadcrumb.remove()
  })
})


describe("breadcrumb outline popup", () => {
  const makeBreadcrumb = async () => {
    const breadcrumb = document.createElement("dom-editor-breadcrumb") as DomEditorBreadcrumb
    breadcrumb.path = [
      {path: [], name: "Document"},
      {path: [0], name: "Repeated", sections: [{path: [0, 0], type: "section", name: "Section"}]},
      {path: [0, 0], name: "Repeated"},
    ]
    breadcrumb.tree = {
      path: [], name: "Document", children: [{path: [0], name: "Repeated", children: [
        {path: [0, 0], name: "Repeated", children: []},
        {path: [0, 1], name: "Repeated", children: []},
      ], sections: [{path: [0, 2], type: "section", name: "Section"}]},
      {path: [1], name: "Other", children: []}],
    }
    document.body.append(breadcrumb)
    await breadcrumb.updateComplete
    return breadcrumb
  }

  it("keeps the complete breadcrumb path visible and the bar 30px tall while open", async () => {
    const breadcrumb = await makeBreadcrumb()
    const nav = breadcrumb.shadowRoot!.querySelector("nav")!
    const toggle = breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>('.separator-trigger[aria-label="Show Repeated tree"]')!
    toggle.click()
    await breadcrumb.updateComplete
    await Promise.resolve()
    expect(breadcrumb.treeOpen).toBe(true)
    expect(breadcrumb.shadowRoot!.querySelector("#document-tree")).not.toBeNull()
    expect(Array.from(nav.querySelectorAll(".item-label"), item => item.textContent)).toEqual(["Document", "Repeated", "Repeated"])
    expect(getComputedStyle(breadcrumb).height).toBe("30px")
  })

  it("creates recursively nested outline entries with section entries and path actions", async () => {
    const breadcrumb = await makeBreadcrumb()
    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".separator-trigger")!.click()
    await breadcrumb.updateComplete
    const menu = breadcrumb.shadowRoot!.querySelector<RibbonMenu>("#document-tree")!
    const root = menu.groups[0].buttons[0] as Exclude<typeof menu.groups[0]["buttons"][number], string>
    expect(root).toMatchObject({label: "Repeated", action: "outline:0"})
    expect(root.submenu).toEqual(expect.arrayContaining([
      expect.objectContaining({label: "Section", action: "outline-section:0,2"}),
      expect.objectContaining({label: "Repeated", action: "outline:0,0", submenu: []}),
    ]))
    expect(menu.groups[0].buttons[1]).toMatchObject({label: "Other", action: "outline:1"})
  })

  it("selects the clicked outline path and closes the popup", async () => {
    const breadcrumb = await makeBreadcrumb()
    const selected = vi.fn()
    breadcrumb.addEventListener("breadcrumb-item-select", selected)
    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".separator-trigger")!.click()
    await breadcrumb.updateComplete
    const menu = breadcrumb.shadowRoot!.querySelector<RibbonMenu>("#document-tree")!
    await Promise.resolve()
    expect(menu.style.left).toBe("")
    expect(menu.style.top).toBe("")
    const target = menu.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="outline:1"]')!
    target.click()
    await breadcrumb.updateComplete
    expect(selected).toHaveBeenCalledWith(expect.objectContaining({detail: expect.objectContaining({path: [1], name: "Other"})}))
    expect(breadcrumb.treeOpen).toBe(false)
    expect(breadcrumb.shadowRoot!.querySelector("#document-tree")).toBeNull()
    expect(menu.className).not.toMatch(/◆anchor-/)
  })

  it("closes when the native popover reports a closed toggle", async () => {
    const breadcrumb = await makeBreadcrumb()
    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".separator-trigger")!.click()
    await breadcrumb.updateComplete
    const menu = breadcrumb.shadowRoot!.querySelector<RibbonMenu>("#document-tree")!
    const event = new Event("toggle")
    Object.defineProperty(event, "newState", {value: "closed"})
    menu.dispatchEvent(event)
    await breadcrumb.updateComplete
    expect(breadcrumb.treeOpen).toBe(false)
    expect(breadcrumb.shadowRoot!.querySelector("#document-tree")).toBeNull()
  })

  it("keeps duplicate labels distinct by their authored paths", async () => {
    const breadcrumb = await makeBreadcrumb()
    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".separator-trigger")!.click()
    await breadcrumb.updateComplete
    const menu = breadcrumb.shadowRoot!.querySelector<RibbonMenu>("#document-tree")!
    const parent = menu.groups[0].buttons[0]
    expect(typeof parent).not.toBe("string")
    const repeated = (parent as Exclude<typeof parent, string>).submenu!.filter(button => typeof button !== "string" && button.label === "Repeated")
    expect(repeated.map(button => typeof button === "string" ? "" : button.action)).toEqual(["outline:0,0", "outline:0,1"])
  })
})


it("updates the left-float information bubble as responsive placement changes", async () => {
  const breadcrumb = document.createElement("dom-editor-breadcrumb")
  document.body.append(breadcrumb)
  for(const forced of [false, true, false]) {
    breadcrumb.path = [{path: [0], name: "Image", float: "far-left", floatForcedRight: forced}]
    await breadcrumb.updateComplete
    await breadcrumb.updateComplete
    expect(!!breadcrumb.shadowRoot!.querySelector("float-info")).toBe(forced)
    if(forced) expect(breadcrumb.shadowRoot!.querySelector("float-info")!.getAttribute("placement")).toBe("right")
  }
  breadcrumb.path = [{path: [0], name: "Image", float: "far-right", floatForcedRight: true}]
  await breadcrumb.updateComplete
  expect(breadcrumb.shadowRoot!.querySelector("float-info")).toBeNull()
})


it("shows a right-float explanation only when responsive layout has no side lanes", async () => {
  const breadcrumb = document.createElement("dom-editor-breadcrumb")
  document.body.append(breadcrumb)
  for(const inFlow of [false, true, false]) {
    breadcrumb.path = [{path: [0], name: "Widget", float: "far-right", floatRightInFlow: inFlow}]
    await breadcrumb.updateComplete
    await breadcrumb.updateComplete
    const info = breadcrumb.shadowRoot!.querySelector<import("./float-info").FloatInfo>("float-info")
    expect(!!info).toBe(inFlow)
    if(info) {
      await info.updateComplete
      expect(info.placement).toBe("right")
      info.shadowRoot!.querySelector(".info")!.dispatchEvent(new MouseEvent("mouseenter"))
      await info.updateComplete
      expect(info.open).toBe(true)
      expect(info.shadowRoot!.querySelector('[role="tooltip"]')!.textContent).toBe("Element will be placed right on wider screens.")
    }
  }
})
