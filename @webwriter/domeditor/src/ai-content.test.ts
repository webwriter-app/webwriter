// @vitest-environment happy-dom
import {describe, expect, it} from "vitest"
import {htmlToFragment} from "./utility"
import {validateAIFragmentStructure} from "./ai-content"

const validate = (html: string, existing?: string) =>
  validateAIFragmentStructure(htmlToFragment(html), existing === undefined ? undefined : htmlToFragment(existing))

describe("validateAIFragmentStructure()", () => {
  it("keeps topic content flat and rejects a new naked section", () => {
    expect(() => validate("<h2>Topic</h2><p>Text</p><demo-widget></demo-widget>")).not.toThrow()
    expect(() => validate("<section><h2>Topic</h2><p>Text</p></section>")).toThrow(/unnecessary.*section.*direct siblings/i)
  })

  it("rejects excessive one-child wrappers", () => {
    expect(() => validate("<div><div><p>Text</p></div></div>")).toThrow(/unnecessary.*div/i)
    expect(() => validate("<article><p>Text</p></article>")).toThrow(/unnecessary.*article/i)
  })

  it("allows a grid or flex parent and a multi-node item group", () => {
    expect(() => validate('<section style="display:grid"><h2>One</h2><p>Two</p></section>')).not.toThrow()
    expect(() => validate('<div style="display:flex"><div><h2>One</h2><p>Two</p></div></div>')).not.toThrow()
    expect(() => validate('<div style="display:grid"><div><p>One</p></div></div>')).toThrow(/unnecessary.*div/i)
  })

  it("preserves required list, table, figure, and fieldset nesting", () => {
    expect(() => validate("<ul><li><p>Item</p></li></ul>")).not.toThrow()
    expect(() => validate("<table><tbody><tr><td><p>Cell</p></td></tr></tbody></table>")).not.toThrow()
    expect(() => validate("<figure><figcaption>Caption</figcaption><img src=photo.png></figure>")).not.toThrow()
    expect(() => validate("<fieldset><legend>Options</legend><label><input type=checkbox> One</label></fieldset>")).not.toThrow()
    expect(() => validate("<table><tbody><tr><td><div><p>Cell</p></div></td></tr></tbody></table>"))
      .toThrow(/unnecessary.*div/i)
  })

  it("treats custom-element light DOM as atomic", () => {
    expect(() => validate("<demo-widget><div><section><p>private</p></section></div></demo-widget>")).not.toThrow()
    expect(() => validate('<div is="demo-widget"><section><p>private</p></section></div>')).not.toThrow()
  })

  it("does not enforce flatness on wrappers already present in the replacement region", () => {
    expect(() => validate("<div><p>new text</p></div>", "<div><p>old text</p></div>")).not.toThrow()
    const existingRoot = document.createElement("div")
    existingRoot.innerHTML = "<p>old text</p>"
    expect(() => validateAIFragmentStructure(htmlToFragment("<div><p>new text</p></div>"), existingRoot)).not.toThrow()
    expect(() => validate("<div><p>new text</p></div>", "<div class=old><p>old text</p></div>"))
      .toThrow(/unnecessary.*div/i)
    expect(() => validate('<div class="topic"><p>new text</p></div>')).not.toThrow()
    expect(() => validate('<div style="--topic-layout: stacked"><p>new text</p></div>')).not.toThrow()
  })

  it("does not mutate the fragment", () => {
    const fragment = htmlToFragment("<section><p>Text</p></section>")
    const before = fragment.firstElementChild!.outerHTML
    expect(() => validateAIFragmentStructure(fragment)).toThrow()
    expect(fragment.firstElementChild!.outerHTML).toBe(before)
  })
})
