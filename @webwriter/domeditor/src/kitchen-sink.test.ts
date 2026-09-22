// @vitest-environment happy-dom
import {describe, expect, it} from "vitest"
import source from "../examples/kitchen-sink.html?raw"
import {insertionMenuItems} from "./components/insertion-menu"

describe("Kitchen Sink example", () => {
  it("pairs every built-in insertion type in root-level two-column layouts", () => {
    const doc = new DOMParser().parseFromString(source, "text/html")
    const groups = doc.querySelectorAll("body > .ww-column-group")
    // The fixture also includes one hidden-main example to explain the
    // document's single-visible-main constraint; it is not a menu insertion.
    expect(groups).toHaveLength(insertionMenuItems.length + 1)
    for(const {tag} of insertionMenuItems) {
      const heading = doc.getElementById(`sample-${tag}`)!
      expect(heading).not.toBeNull()
      let group = heading.nextElementSibling!
      if(group.localName === "p") group = group.nextElementSibling!
      expect(group.className).toBe("ww-column-group")
      for(const side of ["left", "right"]) {
        const sample = group.querySelector(`:scope > .ww-column-${side} > .sample`)!
        expect(sample.children).toHaveLength(1)
        expect(sample.firstElementChild?.localName).toBe(tag)
        if(side === "left") expect(sample.textContent).toBe("")
      }
    }
    expect(doc.querySelectorAll("main:not([hidden])")).toHaveLength(1)
    expect(doc.querySelector("script")).toBeNull()
    expect(source).not.toContain("◆")
    expect(doc.querySelector("#sample-math + .ww-column-group math")?.getAttribute("xmlns")).toBe("http://www.w3.org/1998/Math/MathML")
  })
})
