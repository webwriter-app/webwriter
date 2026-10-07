// @vitest-environment happy-dom
import {describe, expect, it} from "vitest"
import source from "../examples/kitchen-sink.html?raw"
import {InsertionMenu} from "./components/insertion-menu"

describe("Kitchen Sink example", () => {
  it("pairs the current built-in insertion types with empty samples in the float lane", () => {
    const doc = new DOMParser().parseFromString(source, "text/html")
    const items = new InsertionMenu().filteredItems.filter(item => item.section !== "Packages")
    expect(Array.from(doc.querySelectorAll('body > h2[id^="sample-"]'), heading => heading.id))
      .toEqual(items.map(({tag}) => `sample-${tag}`))
    expect(doc.querySelectorAll("body > .sample-empty")).toHaveLength(items.length)
    expect(doc.querySelectorAll("body > .sample-filled")).toHaveLength(items.length)
    for(const {tag} of items) {
      const heading = doc.getElementById(`sample-${tag}`)!
      expect(heading).not.toBeNull()
      const empty = heading.nextElementSibling as HTMLElement
      const filled = empty.nextElementSibling as HTMLElement
      expect(empty.className).toBe("sample-empty")
      expect(empty.style.float).toBe("left")
      expect(filled.className).toBe("sample-filled")
      expect(filled.style.float).toBe("")
      for(const container of [empty, filled]) {
        const sample = container.querySelector(":scope > .sample")!
        expect(sample.children).toHaveLength(1)
        expect(sample.firstElementChild?.localName).toBe(tag)
        if(container === empty) expect(sample.textContent).toBe("")
      }
    }
    expect(doc.querySelector('link[rel="stylesheet"]')?.getAttribute("href")).toBe("../src/document-floats.css")
    expect(source).not.toContain("ww-column-")
    expect(doc.querySelector("pre, main, nav, search, address, blockquote, figure, article, aside, header, footer")).toBeNull()
    expect(doc.querySelector("script")).toBeNull()
    expect(source).not.toContain("◆")
    expect(doc.querySelector("#sample-math + .sample-empty math")?.getAttribute("xmlns")).toBe("http://www.w3.org/1998/Math/MathML")
  })
})
