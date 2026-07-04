// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest"
import '@testing-library/jest-dom/vitest'

import { DOMEditor } from "../domeditor"
import { TransformationFeature } from "./transformation"
import { $ } from "../utility"

var editor = new DOMEditor()
let feature: TransformationFeature

// The drag-based handlers (handleScaleDrag, handleMoveDrag, handleRotateDrag)
// require DragEvents with real coordinates and layout, which happy-dom does
// not provide — they are exercised in the browser instead.

beforeEach(() => {
  document.body.innerHTML = ""
  document.body.className = ""
  document.documentElement.className = ""
  // Clearing the body removes the editor appendix (which holds the overlay
  // anchor); a fresh feature instance recreates it. All element getters
  // resolve through the document, so this instance and the editor's enabled
  // instance operate on the same elements.
  feature = new TransformationFeature(editor)
})

function el(tag = "div", text = "") {
  const element = document.createElement(tag)
  element.textContent = text
  document.body.append(element)
  return element
}

describe("startTransform()", () => {
  it("marks the element as transform target and shows the overlay", () => {
    const target = el()
    feature.startTransform(target)
    expect(target.classList.contains("◆transform-target")).toBe(true)
    expect(feature.target).toBe(target)
    expect(feature.overlay.hasAttribute("visibility")).toBe(false)
  })
  it("refuses the document root, head and body", () => {
    feature.startTransform(document.documentElement)
    feature.startTransform(document.head as unknown as HTMLElement)
    feature.startTransform(document.body)
    expect(document.querySelector(".◆transform-target")).toBeNull()
  })
  it("marks the containing block and stacking container", () => {
    feature.startTransform(el())
    expect(document.body.classList.contains("◆transform-containing-block")).toBe(true)
    expect(document.documentElement.classList.contains("◆transform-stacking-container")).toBe(true)
  })
})

describe("clearTransform()", () => {
  it("unmarks the target and hides the overlay", () => {
    const target = el()
    feature.startTransform(target)
    feature.clearTransform()
    expect(target.classList.contains("◆transform-target")).toBe(false)
    expect(feature.overlay.getAttribute("visibility")).toBe("hidden")
  })
  it("clears containing block and stacking container markers on body and root", () => {
    feature.startTransform(el())
    feature.clearTransform()
    expect(document.body.classList.contains("◆transform-containing-block")).toBe(false)
    expect(document.documentElement.classList.contains("◆transform-stacking-container")).toBe(false)
  })
})

describe("overlay", () => {
  it("is created lazily and reused", () => {
    const first = feature.overlay
    expect(feature.overlay).toBe(first)
    expect(document.getElementById("◆transform-overlay")).toBe(first)
  })
  it("contains the transform controls", () => {
    const overlay = feature.overlay
    expect(overlay.querySelectorAll(".◆transform-overlay-scale")).toHaveLength(8)
    expect(overlay.querySelector("#◆transform-overlay-rotator")).not.toBeNull()
    expect(overlay.querySelector("#◆transform-overlay-arranger")).not.toBeNull()
    expect(overlay.querySelector("#◆transform-overlay-orderer")).not.toBeNull()
  })
})

describe("getOppositeScaler()", () => {
  it("returns the diagonally opposite scaler", () => {
    feature.overlay
    const upLeft = document.getElementById("◆transform-overlay-scale-up-left")!
    expect(feature.getOppositeScaler(upLeft).id).toBe("◆transform-overlay-scale-down-right")
    const leftLeft = document.getElementById("◆transform-overlay-scale-left-left")!
    expect(feature.getOppositeScaler(leftLeft).id).toBe("◆transform-overlay-scale-right-right")
  })
})

describe("toggleAbsoluteRelative()", () => {
  it("toggles between absolute and relative positioning", () => {
    const target = el()
    feature.startTransform(target)
    feature.toggleAbsoluteRelative()
    expect(target.style.position).toBe("absolute")
    feature.toggleAbsoluteRelative()
    expect(target.style.position).toBe("relative")
  })
  it("clears the position offsets", () => {
    const target = el()
    target.style.top = "5px"
    target.style.left = "10px"
    feature.startTransform(target)
    feature.toggleAbsoluteRelative()
    expect(target.style.top).toBe("")
    expect(target.style.left).toBe("")
  })
})

describe("toggleSticky()", () => {
  it("toggles between relative and sticky positioning", () => {
    const target = el()
    target.style.position = "relative"
    feature.startTransform(target)
    feature.toggleSticky()
    expect(target.style.position).toBe("sticky")
    feature.toggleSticky()
    expect(target.style.position).toBe("relative")
  })
})

describe("restore()", () => {
  it("clears all transform-related styles", () => {
    const target = el()
    feature.startTransform(target)
    Object.assign(target.style, {width: "50px", height: "60px", rotate: "45deg", position: "absolute", top: "1px", left: "2px", float: "left"})
    feature.restore()
    for(const property of ["width", "height", "rotate", "position", "top", "left", "float"]) {
      expect(target.style.getPropertyValue(property)).toBe("")
    }
    expect(feature.overlay.classList.contains("◆transform-overlay-changed")).toBe(false)
  })
})

describe("moveZ()", () => {
  it("renumbers z-indexes when moving an element backward", () => {
    const [d1, d2, d3] = [el(), el(), el()]
    feature.moveZ(d3, false)
    expect(d1.style.zIndex).toBe("1")
    expect(d3.style.zIndex).toBe("2")
    expect(d2.style.zIndex).toBe("3")
  })
  it("moves an element to the front", () => {
    const [d1, d2, d3] = [el(), el(), el()]
    feature.moveZ(d1, true, true)
    expect(d2.style.zIndex).toBe("1")
    expect(d3.style.zIndex).toBe("2")
    expect(d1.style.zIndex).toBe("3")
  })
  it("moves an element one step forward", () => {
    const [d1, d2, d3] = [el(), el(), el()]
    feature.moveZ(d1, true)
    expect(d2.style.zIndex).toBe("1")
    expect(d1.style.zIndex).toBe("2")
    expect(d3.style.zIndex).toBe("3")
  })
  it("cycles from the top back to the bottom", () => {
    const [d1, d2, d3] = [el(), el(), el()]
    feature.moveZ(d3, true, false, true)
    expect(d3.style.zIndex).toBe("1")
    expect(d1.style.zIndex).toBe("2")
    expect(d2.style.zIndex).toBe("3")
  })
})

describe("arranger menu", () => {
  it("sets the target's float via the menu buttons", () => {
    const target = el()
    feature.startTransform(target)
    document.getElementById("◆transform-overlay-float-left")!.click()
    expect(target.style.float).toBe("left")
    expect(feature.arranger.getAttribute("data-float")).toBe("left")
    document.getElementById("◆transform-overlay-float-right")!.click()
    expect(target.style.float).toBe("right")
    document.getElementById("◆transform-overlay-float-none")!.click()
    expect(target.style.float).toBe("")
  })
})

describe("document listeners", () => {
  it("removes the target on Delete", () => {
    const target = el("div", "x")
    feature.startTransform(target)
    $.selectDocumentStart()
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Delete"}))
    expect(document.body.contains(target)).toBe(false)
    expect(document.querySelector(".◆transform-target")).toBeNull()
  })
  it("copies the target without editor-only elements", async () => {
    const target = el("div", "hi")
    const helper = document.createElement("span")
    helper.classList.add("◆", "◆editor-only")
    helper.textContent = "HELPER"
    target.append(helper)
    feature.startTransform(target)
    document.dispatchEvent(new Event("copy"))
    await new Promise(resolve => setTimeout(resolve))
    const item = (await navigator.clipboard.read()).find(item => item.types.includes("text/html"))
    const html = await (await item?.getType("text/html"))?.text()
    expect(html).toContain("hi")
    expect(html).not.toContain("HELPER")
  })
  it("copies the target without marker classes", async () => {
    const target = el("div", "hi")
    feature.startTransform(target)
    document.dispatchEvent(new Event("copy"))
    await new Promise(resolve => setTimeout(resolve))
    const item = (await navigator.clipboard.read()).find(item => item.types.includes("text/html"))
    const html = await (await item?.getType("text/html"))?.text()
    expect(html).not.toContain("◆")
  })
  it("cuts the target out of the document", async () => {
    const target = el("div", "hi")
    feature.startTransform(target)
    document.dispatchEvent(new Event("cut"))
    await new Promise(resolve => setTimeout(resolve))
    expect(document.body.contains(target)).toBe(false)
    const item = (await navigator.clipboard.read()).find(item => item.types.includes("text/html"))
    const html = await (await item?.getType("text/html"))?.text()
    expect(html).toContain("hi")
  })
  it("clears the transform on a click outside the overlay", () => {
    const target = el()
    const other = el()
    feature.startTransform(target)
    other.dispatchEvent(new MouseEvent("click", {bubbles: true}))
    expect(document.querySelector(".◆transform-target")).toBeNull()
  })
  it("starts a transform on modifier double click on a selected element", () => {
    const target = el()
    target.classList.add("◆element-selected")
    target.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, ctrlKey: true}))
    expect(target.classList.contains("◆transform-target")).toBe(true)
  })
})
