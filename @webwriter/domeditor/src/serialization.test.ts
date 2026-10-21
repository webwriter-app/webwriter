// @vitest-environment happy-dom
import {describe, expect, it} from "vitest"
import {appendSerializedAssets, restoreOriginalResourceURLs, serializeDoctype} from "./serialization"
import type {WebWriterPackage} from "./packages"

it.each(["", "ww-canvas", "ww-slides", "ww-board"])("embeds attribution reading controls once for layout '%s' without authored UI", layout => {
  const root = new DOMParser().parseFromString(`<body class="${layout}"><div data-ww-attribution-name="Ada" data-ww-license="CC-BY-4.0"><custom-widget></custom-widget></div></body>`, "text/html")
  const body = root.body.innerHTML
  appendSerializedAssets(root, [])
  appendSerializedAssets(root, [])
  const scripts = root.querySelectorAll("#webwriter-attribution-reader")
  expect(scripts).toHaveLength(1)
  expect(scripts[0].textContent).toContain("mountAttributionReader(")
  expect(scripts[0].textContent).not.toContain("import {")
  expect(root.body.innerHTML).toBe(body)
  root.querySelector("div")!.removeAttribute("data-ww-attribution-name")
  root.querySelector("div")!.removeAttribute("data-ww-license")
  appendSerializedAssets(root, [])
  expect(root.querySelector("#webwriter-attribution-reader")).toBeNull()
})

it("keeps encoding metadata before the adapter and installs it before widget modules", () => {
  const root = new DOMParser().parseFromString('<html><head><meta charset="utf-8"><title>Grüße</title><script type="module" src="https://example.test/widget.js"></script></head><body><demo-widget></demo-widget></body></html>', "text/html")
  const pkg = {scripts: ["https://example.test/widget.js"], styles: [], members: [{kind: "widget", tagName: "demo-widget"}]} as unknown as WebWriterPackage
  appendSerializedAssets(root, [pkg], {imports: {lit: "https://example.test/lit.js"}})
  expect(root.head.firstElementChild?.getAttribute("charset")).toBe("utf-8")
  const scripts = Array.from(root.head.querySelectorAll("script"))
  expect(scripts[0].id).toBe("webwriter-scoped-registry")
  expect(scripts[1].type).toBe("importmap")
  expect(scripts[2].src).toBe("https://example.test/widget.js")
  expect(root.documentElement.outerHTML.indexOf('charset="utf-8"')).toBeLessThan(1024)
})

it("includes aligned marker styling in standalone exports without changing the body", () => {
  const root = new DOMParser().parseFromString('<ul style="--ww-list-marker-image: url(data:image/png;base64,AQID); list-style-image: var(--ww-list-marker-image)"><li>Item</li></ul>', "text/html")
  const body = root.body.innerHTML
  appendSerializedAssets(root, [])
  expect(root.querySelector("#webwriter-list-marker-styles")!.textContent).toContain("inset-block-start: calc((1lh - 1em) / 2)")
  expect(root.body.innerHTML).toBe(body)
  appendSerializedAssets(root, [])
  expect(root.querySelectorAll("#webwriter-list-marker-styles")).toHaveLength(1)
  root.querySelector("ul")!.removeAttribute("style")
  appendSerializedAssets(root, [])
  expect(root.querySelector("#webwriter-list-marker-styles")).toBeNull()
})

it("passes the document language dictionary into the import-free document reader", () => {
  const root = new DOMParser().parseFromString('<html lang="de-AT"><body><p>Text</p></body></html>', "text/html")
  appendSerializedAssets(root, [])
  const viewer = root.querySelector<HTMLScriptElement>("#webwriter-document-viewer")!
  expect(viewer.textContent).toMatch(/mountDocumentReader\([\s\S]*?, null, \{/)
  expect(viewer.textContent).toContain('"Document information and actions":"Dokumentinformationen und Aktionen"')
  expect(viewer.textContent).toContain('"Print document":"Dokument drucken"')
  expect(viewer.textContent).not.toContain('import {')
})

describe("serializeDoctype()", () => {
  it("omits a missing doctype", () => {
    expect(serializeDoctype(null)).toBe("")
  })

  it.each([
    ["HTML5", "html", "", "", "<!DOCTYPE html>"],
    ["a public identifier", "html", "-//W3C//DTD XHTML 1.0 Strict//EN", "", '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN">'],
    ["a system identifier", "svg", "", "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd", '<!DOCTYPE svg SYSTEM "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">'],
    ["public and system identifiers", "html", "-//W3C//DTD XHTML 1.0 Strict//EN", "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd", '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">'],
  ])("serializes %s syntax", (_case, name, publicId, systemId, expected) => {
    const doctype = document.implementation.createDocumentType(name, publicId, systemId)

    expect(serializeDoctype(doctype)).toBe(expected)
  })
})

describe("restoreOriginalResourceURLs()", () => {
  it("restores a marker on the root element", () => {
    const image = document.createElement("img")
    image.setAttribute("data-webwriter-original-src", "/photo.png")
    image.setAttribute("src", "data:image/png;base64,AQID")

    restoreOriginalResourceURLs(image)

    expect(image.getAttribute("src")).toBe("/photo.png")
    expect(image.hasAttribute("data-webwriter-original-src")).toBe(false)
  })
})


it("includes one hotspot popover runtime in standalone exports", () => {
  const root = new DOMParser().parseFromString('<img usemap="#plan"><map name="plan"><area href="#details" popovertarget="details"></map><div id="details" popover="auto"><strong>Content</strong></div>', "text/html")
  const body = root.body.innerHTML
  appendSerializedAssets(root, [])
  appendSerializedAssets(root, [])
  expect(root.querySelectorAll("#webwriter-image-map-popovers")).toHaveLength(1)
  expect(root.querySelector("#webwriter-image-map-popovers")!.textContent).toContain('document.addEventListener("pointerover", handle)')
  expect(root.body.innerHTML).toBe(body)
  root.querySelector("area")!.removeAttribute("popovertarget")
  appendSerializedAssets(root, [])
  // Link-only maps also need scaled reading-mode hit areas.
  expect(root.querySelector("#webwriter-image-map-popovers")!.textContent).toContain("mountImageMapReader(document, controller, imageMapHotspotShape)")
  root.querySelector("map")!.remove()
  appendSerializedAssets(root, [])
  expect(root.querySelector("#webwriter-image-map-popovers")).toBeNull()
})
