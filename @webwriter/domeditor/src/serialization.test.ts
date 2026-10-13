// @vitest-environment happy-dom
import {describe, expect, it} from "vitest"
import {appendSerializedAssets, restoreOriginalResourceURLs, serializeDoctype} from "./serialization"

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
  expect(root.querySelector("#webwriter-image-map-popovers")).toBeNull()
})
