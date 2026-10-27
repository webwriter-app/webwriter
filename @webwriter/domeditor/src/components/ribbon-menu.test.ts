// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {RibbonMenu} from "./ribbon-menu"
import {insertMathStructureButtons} from "./ribbon-menu-config"
import {graphicShapeOptions} from "../graphic"

const opened = new Set<HTMLElement>()
const showPopover = vi.fn(function(this: HTMLElement) {opened.add(this)})
const hidePopover = vi.fn(function(this: HTMLElement) {opened.delete(this)})
const originalShow = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "showPopover")
const originalHide = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "hidePopover")

beforeEach(() => {
  Object.defineProperties(HTMLElement.prototype, {
    showPopover: {value: showPopover, configurable: true},
    hidePopover: {value: hidePopover, configurable: true},
  })
})
afterEach(() => {
  document.body.replaceChildren()
  if(originalShow) Object.defineProperty(HTMLElement.prototype, "showPopover", originalShow)
  else delete (HTMLElement.prototype as Partial<HTMLElement>).showPopover
  if(originalHide) Object.defineProperty(HTMLElement.prototype, "hidePopover", originalHide)
  else delete (HTMLElement.prototype as Partial<HTMLElement>).hidePopover
  opened.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function mount() {
  const menu = new RibbonMenu()
  menu.groups = [{label: "Elements", buttons: [{label: "List", submenu: [
    {label: "Enumeration", submenu: [{label: "Decimal", action: "list-style:ol:decimal"}]},
    {label: "Disc", action: "list-style:ul:disc"},
  ]}]}]
  document.body.append(menu)
  await menu.updateComplete
  return menu
}

async function open(menu: RibbonMenu, label: string) {
  menu.shadowRoot!.querySelector<HTMLButtonElement>(`[aria-label="Show more ${label} options"]`)!.click()
  await menu.updateComplete
  await Promise.resolve()
  return menu.shadowRoot!.querySelector<HTMLElement>(".submenu")!
}

describe("nested ribbon menus", () => {
  it("lets shape galleries use the viewport height in button menus and submenus", async () => {
    const buttons=graphicShapeOptions.map(shape=>({label:shape.label,category:shape.category,path:shape.path}))
    const menu=new RibbonMenu()
    menu.groups=[{label:"Shapes",buttons}]
    document.body.append(menu)
    await menu.updateComplete
    const surface=menu.shadowRoot!.querySelector<HTMLElement>(".menu")!
    expect(getComputedStyle(surface).maxHeight).toBe(`calc(${window.innerHeight}px - 16px)`)
    expect(getComputedStyle(surface).boxSizing).toBe("border-box")
    expect(getComputedStyle(surface).overflow).toBe("auto")
    menu.groups=[{label:"Elements",buttons:[{label:"Shapes",submenu:buttons}]}]
    await menu.updateComplete
    const submenu=await open(menu,"Shapes")
    expect(getComputedStyle(submenu).maxHeight).toBe(`calc(${window.innerHeight}px - 16px)`)
    expect(getComputedStyle(submenu).boxSizing).toBe("border-box")
    expect(getComputedStyle(submenu).overflow).toBe("auto")
  })

  it("lets formula menus use the viewport height instead of the standard menu cap", async () => {
    const menu = new RibbonMenu()
    menu.groups = [{label: "Formula options", buttons: insertMathStructureButtons}]
    document.body.append(menu)
    await menu.updateComplete
    const surface = menu.shadowRoot!.querySelector<HTMLElement>(".menu")!
    expect(getComputedStyle(surface).maxHeight).toBe(`calc(${window.innerHeight}px - 48px)`)
    expect(getComputedStyle(surface).overflow).toBe("auto")

    menu.groups = [{label: "Elements", buttons: [{label: "Formula", submenu: insertMathStructureButtons}]}]
    await menu.updateComplete
    const submenu = await open(menu, "Formula")
    expect(getComputedStyle(submenu).maxHeight).toBe(`calc(${window.innerHeight}px - 48px)`)
    expect(getComputedStyle(submenu).overflow).toBe("auto")
  })

  it("promotes every submenu to the top layer and closes only the innermost menu on Escape", async () => {
    const menu = await mount()
    const parent = await open(menu, "List")
    const nested = parent.querySelector<RibbonMenu>("ribbon-menu")!
    await nested.updateComplete
    const child = await open(nested, "Enumeration")
    expect(parent.getAttribute("popover")).toBe("manual")
    expect(child.getAttribute("popover")).toBe("manual")
    expect(opened.has(parent)).toBe(true)
    expect(opened.has(child)).toBe(true)
    child.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true, composed: true}))
    await nested.updateComplete
    expect(opened.has(child)).toBe(false)
    expect(opened.has(parent)).toBe(true)
    expect(nested.shadowRoot!.activeElement?.getAttribute("aria-label")).toBe("Show more Enumeration options")
    menu.closeSubmenus()
    expect(opened.size).toBe(0)
  })

  it("keeps the fallback menu inside the viewport when CSS anchors are unavailable", async () => {
    vi.stubGlobal("CSS", {supports: vi.fn(() => false), escape: CSS.escape})
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
      return this.classList.contains("submenu") ? new DOMRect(0, 0, 200, 300)
        : new DOMRect(window.innerWidth - 60, window.innerHeight - 10, 40, 10)
    })
    const menu = await mount()
    const popup = await open(menu, "List")
    expect(popup.style.position).toBe("fixed")
    expect(popup.style.left).toBe(`${window.innerWidth - 264}px`)
    expect(popup.style.top).toBe(`${window.innerHeight - 308}px`)
  })

  it("closes the whole popup tree on removal and ignores pending opens after disconnection", async () => {
    const menu = await mount()
    const parent = await open(menu, "List")
    const nested = parent.querySelector<RibbonMenu>("ribbon-menu")!
    await nested.updateComplete
    await open(nested, "Enumeration")
    menu.remove()
    expect(opened.size).toBe(0)
    const pending = await mount()
    pending.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-toggle")!.click()
    pending.remove()
    await pending.updateComplete
    expect(opened.size).toBe(0)
  })

  it("opens the submenu belonging to the clicked action when labels repeat", async () => {
    const menu = new RibbonMenu()
    menu.groups = [{label: "Outline", buttons: [
      {label: "Repeated", action: "outline:0", submenu: [{label: "First child", action: "outline:0,0"}]},
      {label: "Repeated", action: "outline:1", submenu: [{label: "Second child", action: "outline:1,0"}]},
    ]}]
    document.body.append(menu)
    await menu.updateComplete
    const expanders = menu.shadowRoot!.querySelectorAll<HTMLButtonElement>(".submenu-toggle")
    expanders[1].click()
    await menu.updateComplete
    const submenu = menu.shadowRoot!.querySelector<HTMLElement>('.submenu[data-submenu-key="outline:1"]')!
    expect(submenu.querySelector<HTMLButtonElement>('[aria-label="Second child"]')?.textContent?.trim()).toBe("Second child")
    expect(submenu.querySelector('[aria-label="First child"]')).toBeNull()
  })

})
