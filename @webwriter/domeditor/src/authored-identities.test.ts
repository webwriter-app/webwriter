// @vitest-environment happy-dom
import {beforeEach, describe, expect, it} from "vitest"
import {ensureAuthoredElementIds, remapPastedAuthoredIds} from "./authored-identities"

describe("authored element identities", () => {
  beforeEach(() => { document.body.innerHTML = "" })

  it("assigns stable IDs only to flow figures, dialogs, popovers and SVG content", () => {
    document.body.innerHTML = `<figure><img><figcaption>caption</figcaption></figure>
      <figure><img><figcaption>caption</figcaption><span>extra</span></figure>
      <dialog></dialog><div popover></div><svg><defs><path></path></defs><g><rect></rect></g></svg>
      <x-widget><dialog></dialog></x-widget>`
    ensureAuthoredElementIds(document.body)
    const ids = Array.from(document.body.querySelectorAll("[id]"))
    expect(ids).toHaveLength(6)
    expect(ids.every(element => element.id.startsWith("ww-"))).toBe(true)
    const before = ids.map(element => element.id)
    ensureAuthoredElementIds(document.body)
    expect(ids.map(element => element.id)).toEqual(before)
  })

  it("keeps unique authored IDs and repairs duplicate target IDs with local references", () => {
    document.body.innerHTML = `<dialog id="authored"><span aria-labelledby="authored">x</span></dialog>
      <dialog id="authored"><span aria-labelledby="authored">y</span></dialog>`
    const dialogs = Array.from(document.querySelectorAll("dialog"))
    ensureAuthoredElementIds(document.body)
    expect(dialogs[0].id).toBe("authored")
    expect(dialogs[1].id).not.toBe("authored")
    expect(dialogs[1].querySelector("span")?.getAttribute("aria-labelledby")).toBe(dialogs[1].id)
  })

  it("does not replace IDs on targets whose ID is already unique", () => {
    document.body.innerHTML = `<figure id="section-figure"><img><figcaption>caption</figcaption></figure>`
    ensureAuthoredElementIds(document.body)
    expect(document.querySelector("figure")?.id).toBe("section-figure")
  })

  it("rebases pasted dialog and SVG IDs together with local references", () => {
    document.body.innerHTML = '<dialog id="panel"></dialog><svg><rect id="shape"/></svg>'
    const template = document.createElement("template")
    template.innerHTML = '<button commandfor="panel">Open</button><dialog id="panel"></dialog><svg><rect id="shape"/><use href="#shape"/></svg>'
    remapPastedAuthoredIds(template.content, document)
    const copiedDialog = template.content.querySelector("dialog")!
    const copiedShape = template.content.querySelector("rect")!
    expect(copiedDialog.id).not.toBe("panel")
    expect(template.content.querySelector("button")?.getAttribute("commandfor")).toBe(copiedDialog.id)
    expect(copiedShape.id).not.toBe("shape")
    expect(template.content.querySelector("use")?.getAttribute("href")).toBe(`#${copiedShape.id}`)
  })
})
