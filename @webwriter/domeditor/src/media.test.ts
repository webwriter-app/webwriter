// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {createImageMapPopoverController, imageMapHotspotShape, mountImageMapReader} from "./media"
import {appendSerializedAssets} from "./serialization"

let reader: ReturnType<typeof mountImageMapReader> | undefined
afterEach(() => {
  reader?.dispose()
  reader = undefined
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

function fixture() {
  document.body.innerHTML = '<img src="plan.png" usemap="#plan"><map name="plan"><span><!--keep--><area shape="rect" coords="500,40,680,340" href="#details" popovertarget="details" alt="Details"></span><area shape="circle" coords="100,100,40" href="https://example.org" target="_blank" rel="noopener" alt="Website"></map><div id="details" popover="auto">Content</div>'
  const image = document.querySelector("img")!
  Object.defineProperties(image, {naturalWidth: {value:720}, naturalHeight: {value:420}})
  const geometry = {left:20, top:30, width:360, height:210}
  vi.spyOn(image, "getBoundingClientRect").mockImplementation(() => new DOMRect(geometry.left, geometry.top, geometry.width, geometry.height))
  const controller = createImageMapPopoverController(document)
  vi.spyOn(controller, "open").mockReturnValue(true)
  reader = mountImageMapReader(document, controller)
  const root = document.body.shadowRoot!.querySelector(".◆image-map-reader")!.shadowRoot!
  return {image, geometry, controller, root}
}

describe("image-map reading mode", () => {
  it("scales visible links without altering irregular authored maps", () => {
    const {image, geometry, root} = fixture()
    const authored = document.body.innerHTML
    const svg = root.querySelector("svg")!
    expect(svg.getAttribute("viewBox")).toBe("0 0 720 420")
    expect(svg.getAttribute("preserveAspectRatio")).toBe("none")
    expect(svg.style.width).toBe("360px")
    expect(root.querySelector('a[aria-label="Details"] rect')!.getAttribute("x")).toBe("500")
    const link = root.querySelector('a[aria-label="Website"]')!
    expect(link.getAttribute("href")).toBe("https://example.org")
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toBe("noopener")
    geometry.width = 180
    geometry.left = 50
    reader!.refresh()
    expect(svg.style.width).toBe("180px")
    expect(svg.style.left).toBe("50px")
    expect(root.querySelector('a[aria-label="Website"]')).toBe(link)
    expect(document.body.innerHTML).toBe(authored)
    image.remove()
    reader!.refresh()
    expect(root.querySelector("svg")).toBeNull()
    reader!.dispose()
    expect(document.body.shadowRoot!.querySelector(".◆image-map-reader")).toBeNull()
    expect(document.body.shadowRoot!.querySelector("slot:not([name])")).not.toBeNull()
  })

  it("opens click and hover popovers from the corresponding current area", () => {
    const {image, controller, root} = fixture()
    const area = document.querySelector("area")!
    const click = new MouseEvent("click", {bubbles:true, composed:true, cancelable:true})
    root.querySelector('a[aria-label="Details"]')!.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
    expect(controller.open).toHaveBeenLastCalledWith(area, image)
    area.removeAttribute("popovertarget")
    area.setAttribute("interestfor", "details")
    reader!.refresh()
    root.querySelector('a[aria-label="Details"]')!.dispatchEvent(new Event("pointerover"))
    expect(controller.open).toHaveBeenCalledTimes(2)
    const stale = root.querySelector('a[aria-label="Details"]')!
    area.replaceWith(area.cloneNode(true))
    stale.dispatchEvent(new MouseEvent("click", {cancelable:true}))
    expect(controller.open).toHaveBeenCalledTimes(2)
    reader!.refresh()
    root.querySelector('a[aria-label="Details"]')!.dispatchEvent(new MouseEvent("click", {cancelable:true}))
    expect(controller.open).toHaveBeenCalledTimes(3)
  })

  it.each(["ww-hotspot-transparent", "ww-hotspot-no-border", "ww-hotspot-no-background"])("applies %s without disabling hotspot actions", name => {
    const {root, controller, image} = fixture()
    const area = document.querySelector("area")!
    area.classList.add(name)
    reader!.refresh()
    const shape = root.querySelector('a[aria-label="Details"] > rect')!
    expect(shape.classList.contains(name)).toBe(true)
    shape.parentElement!.dispatchEvent(new MouseEvent("click", {cancelable:true}))
    expect(controller.open).toHaveBeenCalledWith(area, image)
    area.classList.remove(name)
    reader!.refresh()
    expect(root.querySelector(`.${name}`)).toBeNull()
  })

  it("executes the exported runtime with no editor module scope", () => {
    fixture()
    reader!.dispose()
    const authored = document.body.innerHTML
    const exported = new DOMParser().parseFromString(authored, "text/html")
    appendSerializedAssets(exported, [])
    const code = exported.querySelector("#webwriter-image-map-popovers")!.textContent!
    new Function("document", "window", code)(document, window)
    expect(document.body.shadowRoot!.querySelector(".◆image-map-reader")!.shadowRoot!.querySelectorAll("a")).toHaveLength(2)
    expect(document.body.innerHTML).toBe(authored)
    window.dispatchEvent(new Event("pagehide"))
    expect(document.body.shadowRoot!.querySelector(".◆image-map-reader")).toBeNull()
  })
})

it.each([
  ["rect", "40,30,10,20", "rect"],
  ["circle", "20,30,10", "circle"],
  ["poly", "0,0,50,20,30,40", "polygon"],
  ["default", "", "rect"],
  ["rect", "a,2,3,4", null],
  ["poly", "1,2,3", null],
])("shares %s geometry with the editor", (shape, coords, tag) => {
  const area = document.createElement("area")
  area.setAttribute("shape", shape!)
  area.setAttribute("coords", coords!)
  expect(imageMapHotspotShape(area, 720, 420)?.localName ?? null).toBe(tag)
})
