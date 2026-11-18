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

describe("breadcrumb element actions", () => {
  it("toggles through the active breadcrumb button without a separate input", async () => {
    const breadcrumb = document.createElement("dom-editor-breadcrumb") as DomEditorBreadcrumb
    const documentItem = {path: [], name: "Document"}
    const paragraph = {path: [0], ...getElementPresentation("p"), targetId: "paragraph"}
    breadcrumb.path = [documentItem, paragraph]
    breadcrumb.tree = {...documentItem, children: [{...paragraph, children: [{path: [0, 0], name: "Link", children: []}]}]}
    document.body.append(breadcrumb)
    await breadcrumb.updateComplete

    const root = breadcrumb.shadowRoot!
    const button = root.querySelector<HTMLButtonElement>('.item[data-path="0"]')!
    expect(button.getAttribute("aria-pressed")).toBe("false")
    expect(root.querySelectorAll("[aria-pressed]")).toHaveLength(1)
    expect(root.querySelector("input")).toBeNull()
    expect(root.querySelector('[aria-label^="Delete"]')).toBeNull()
    expect(button.closest("li")?.nextElementSibling?.querySelector('[aria-label="Show Paragraph tree"]')).not.toBeNull()
    const toggle = vi.fn()
    breadcrumb.addEventListener("breadcrumb-item-toggle", toggle)
    button.querySelector<HTMLElement>(".item-label")!.click()
    expect(toggle.mock.calls[0][0].detail).toEqual({path: [0], targetId: "paragraph"})

    breadcrumb.path = [documentItem, {...paragraph, targetId: "replacement", targetSelected: true}]
    await breadcrumb.updateComplete
    expect(button.getAttribute("aria-pressed")).toBe("true")
    button.querySelector<HTMLElement>(".item-icon")!.click()
    expect(toggle.mock.calls[1][0].detail).toEqual({path: [0], targetId: "replacement"})

    breadcrumb.path = [documentItem]
    await breadcrumb.updateComplete
    expect(root.querySelector("[aria-pressed]")).toBeNull()
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

  it.each(["far-left", "far-right"] as const)("shows a balloon after the symbol when a %s float is pinned", async float => {
    const breadcrumb = document.createElement("dom-editor-breadcrumb") as DomEditorBreadcrumb
    document.body.append(breadcrumb)
    const item = {path: [0], name: "Image", float}
    breadcrumb.path = [{...item, position: "sticky", positionAnchor: true}]
    await breadcrumb.updateComplete
    const root = breadcrumb.shadowRoot!
    expect(root.querySelector('.position-float + [aria-label="Pinned float"] .icon-tabler-balloon')).not.toBeNull()
    expect(root.querySelector(".position-anchor")).toBeNull()

    breadcrumb.path = [item]
    await breadcrumb.updateComplete
    expect(root.querySelector(".position-balloon")).toBeNull()
    breadcrumb.path = [{path: [0], name: "Image", position: "sticky", positionAnchor: true}]
    await breadcrumb.updateComplete
    expect(root.querySelector(".position-balloon")).toBeNull()
    expect(root.querySelector(".position-anchor")).not.toBeNull()
  })
})

describe("breadcrumb path separators", () => {
  it("shows chevrons along a popup path inside an opaque table tree item", async () => {
    const breadcrumb = document.createElement("dom-editor-breadcrumb") as DomEditorBreadcrumb
    breadcrumb.path = [
      {path: [], name: "Document"},
      {path: [0], name: "Table"},
      {path: [0, 0, 0, 0, 1], name: "Popup"},
      {path: [0, 0, 0, 0, 1, 0], name: "Popup Content"},
    ]
    breadcrumb.tree = {path: [], name: "Document", children: [
      {path: [0], name: "Table", children: []},
    ]}
    document.body.append(breadcrumb)
    await breadcrumb.updateComplete
    const separators = breadcrumb.shadowRoot!.querySelectorAll(".breadcrumb-list > .separator")
    expect(separators).toHaveLength(3)
    expect(Array.from(separators).every(separator => separator.querySelector(".separator-icon svg"))).toBe(true)
    expect(separators[1].querySelector(".separator-trigger")).toBeNull()
    expect(separators[2].querySelector(".separator-trigger")).toBeNull()
  })
})

describe("breadcrumb outline lookups", () => {
  const mount = async (configure: (breadcrumb: DomEditorBreadcrumb) => void) => {
    const breadcrumb = document.createElement("dom-editor-breadcrumb") as DomEditorBreadcrumb
    configure(breadcrumb)
    document.body.append(breadcrumb)
    await breadcrumb.updateComplete
    return breadcrumb
  }
  const toggles = (breadcrumb: DomEditorBreadcrumb) => Array.from(
    breadcrumb.shadowRoot!.querySelectorAll(".separator-trigger"), toggle => toggle.getAttribute("aria-label"))
  const sections = (breadcrumb: DomEditorBreadcrumb) => Array.from(
    breadcrumb.shadowRoot!.querySelectorAll<HTMLElement>(".section-item"), section => section.dataset.sectionPath)

  it("resolves authored paths that are not outline child positions, keeping the first of duplicates", async () => {
    // The list sits inside a section the outline looks through, and a popup
    // button is listed where its wrapper is authored.
    const breadcrumb = await mount(breadcrumb => {
      breadcrumb.path = [
        {path: [], name: "Document"},
        {path: [3, 0], name: "List"},
        {path: [3, 0, 2], name: "List Item"},
        {path: [1, 0, 4], name: "Popup"},
      ]
      breadcrumb.tree = {path: [], name: "Document", children: [
        {path: [1, 0, 4], name: "Popup", children: [{path: [7], name: "Popup Content", children: []}]},
        {path: [3, 0], name: "List", sections: [{path: [3], type: "section", name: "Section"}], children: [
          {path: [3, 0, 2], name: "List Item", children: []},
          {path: [1, 0, 4], name: "Popup", sections: [{path: [9], type: "aside", name: "Aside"}], children: []},
        ]},
      ]}
    })
    expect(toggles(breadcrumb)).toEqual(["Show Document tree", "Show List tree", "Show Popup tree"])
    expect(sections(breadcrumb)).toEqual(["3"])
  })

  it("looks up a replaced tree instead of the one it indexed", async () => {
    const breadcrumb = await mount(breadcrumb => {
      breadcrumb.path = [{path: [], name: "Document"}, {path: [0], name: "Quote"}]
      breadcrumb.tree = {path: [], name: "Document", children: [{path: [0], name: "Quote", children: []}]}
    })
    expect(toggles(breadcrumb)).toEqual(["Show Document tree"])
    breadcrumb.tree = {path: [], name: "Document", children: [{path: [0], name: "Quote",
      sections: [{path: [0, 1], type: "footer", name: "Footer"}], children: [{path: [0, 0], name: "Paragraph", children: []}]}]}
    await breadcrumb.updateComplete
    expect(toggles(breadcrumb)).toEqual(["Show Document tree", "Show Quote tree"])
    expect(sections(breadcrumb)).toEqual(["0,1"])
  })

  it("reads chevrons and sections from path items while the outline is not supplied", async () => {
    const breadcrumb = await mount(breadcrumb => {
      breadcrumb.path = [
        {path: [], name: "Document"},
        {path: [0], name: "Quote", sections: [{path: [0, 3], type: "header", name: "Header"}]},
        {path: [0, 0], name: "Paragraph"},
      ]
      breadcrumb.pathItems = [
        {path: [], name: "", children: [{path: [0], name: "", children: []}]},
        {path: [0], name: "", sections: [{path: [0, 3], type: "header", name: "Header"}, {path: [0, 1], type: "footer", name: "Footer"}],
          children: [{path: [0, 0], name: "", children: []}]},
        {path: [0, 0], name: "", children: []},
      ]
    })
    expect(breadcrumb.tree).toBeNull()
    expect(toggles(breadcrumb)).toEqual(["Show Document tree", "Show Quote tree"])
    expect(breadcrumb.shadowRoot!.querySelectorAll(".breadcrumb-list > .separator")).toHaveLength(2)
    expect(sections(breadcrumb)).toEqual(["0,3", "0,1"])

    // The host replaces the items when the outline changes.
    breadcrumb.pathItems = [
      {path: [], name: "", children: [{path: [0], name: "", children: []}]},
      {path: [0], name: "", children: [{path: [0, 0], name: "", children: []}]},
      {path: [0, 0], name: "", children: [{path: [0, 0, 0], name: "", children: []}]},
    ]
    await breadcrumb.updateComplete
    expect(toggles(breadcrumb)).toEqual(["Show Document tree", "Show Quote tree", "Show Paragraph tree"])
    expect(sections(breadcrumb)).toEqual(["0,3"])
  })

  it("prefers path items over a stale tree for the path, and the tree for the open outline", async () => {
    const breadcrumb = await mount(breadcrumb => {
      breadcrumb.path = [{path: [], name: "Document"}, {path: [0], name: "Quote"}]
      breadcrumb.tree = {path: [], name: "Document", children: [
        {path: [0], name: "Quote", children: [{path: [0, 0], name: "Paragraph", children: []}]},
        {path: [1], name: "Other", children: []},
      ]}
      breadcrumb.pathItems = [{path: [], name: "", children: [{path: [0], name: "", children: []}]}, {path: [0], name: "", children: []}]
    })
    expect(toggles(breadcrumb)).toEqual(["Show Document tree"])
    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".separator-trigger")!.click()
    await breadcrumb.updateComplete
    const menu = breadcrumb.shadowRoot!.querySelector<RibbonMenu>("#document-tree")!
    expect(menu.groups[0].buttons.map(button => typeof button === "string" ? button : button.action)).toEqual(["outline:0", "outline:1"])
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
  it("measures expanded and collapsed items in batches", async () => {
    const breadcrumb = document.createElement("dom-editor-breadcrumb") as DomEditorBreadcrumb
    breadcrumb.path = ["One", "Two", "Three"].map((name, index) => ({path: [index], name}))
    document.body.append(breadcrumb)
    await breadcrumb.updateComplete
    const list = breadcrumb.shadowRoot!.querySelector<HTMLElement>(".breadcrumb-list")!
    const items = Array.from(list.querySelectorAll<HTMLElement>(".breadcrumb-entry:not(.separator)"))
    const separators = list.children.length - items.length
    Object.defineProperty(list, "clientWidth", {configurable: true, value: items.length * 80 + separators * 15 - 60})
    const counts: number[] = []
    for(const entry of Array.from(list.children) as HTMLElement[]) {
      vi.spyOn(entry, "getBoundingClientRect").mockImplementation(() => {
        counts.push(items.filter(item => item.querySelector(".item")?.classList.contains("icon-only")).length)
        return {width: entry.classList.contains("separator") ? 15
          : entry.querySelector(".item")?.classList.contains("icon-only") ? 30 : 80} as DOMRect
      })
    }
    window.dispatchEvent(new Event("resize"))
    await Promise.resolve()
    expect(counts.length).toBeGreaterThan(0)
    expect(counts.every(count => count === 0 || count === items.length)).toBe(true)
    expect(items.filter(item => item.querySelector(".item")?.classList.contains("icon-only"))).toHaveLength(2)
  })

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
