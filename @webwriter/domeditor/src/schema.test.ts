// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest"
import '@testing-library/jest-dom/vitest'

import { DOMEditor } from "./domeditor"
import { Schema } from "./schema"
import {normalizeTableStructure} from "./table"
import { $ } from "./utility"

var editor = new DOMEditor()

function expectBodyToBe(html: string) {
  return expect(editor.toHTML(true)).toEqual(html)
}

beforeEach(() => {
  document.body.innerHTML = "<p></p>"
})

describe("create()", () => {
  it("can create a <p> element", () => {
    expect(editor.schema.create("p")).toBeInstanceOf(HTMLParagraphElement)
  })
  it("can create a text element", () => {
    expect(editor.schema.create("#text")).toBeInstanceOf(Text)
  })
  it("can create a comment element", () => {
    expect(editor.schema.create("#comment")).toBeInstanceOf(Comment)
  })
})

describe("head element placement", () => {
  const headTags = ["base", "link", "meta", "noscript", "style", "title", "script", "template"]

  it.each(headTags)("rejects <%s> in body content and insertion options", tag => {
    for(const parentTag of ["body", "section", "p", "ul", "ol", "menu", "dl", "tr", "picture"]) {
      const container = document.createElement(parentTag)
      const element = document.createElement(tag)
      expect(editor.schema.canInsert(container, element, 0), parentTag).toBe(false)
      expect(editor.schema.findValidContentTypes(container), parentTag).not.toContain(tag)
      container.append(element)
      expect(editor.schema.isNodeValid(element), parentTag).toBe(false)
      expect(editor.schema.isContentValid(container), parentTag).toBe(false)
    }
  })

  it.each(headTags)("allows <%s> in the head", tag => {
    const head = document.createElement("head")
    const element = document.createElement(tag)
    expect(editor.schema.canInsert(head, element, 0)).toBe(true)
    expect(editor.schema.findValidContentTypes(head)).toContain(tag)
    head.append(element)
    expect(editor.schema.isNodeValid(element)).toBe(true)
    expect(editor.schema.isContentValid(head)).toBe(true)
  })

  it.each(headTags)("removes <%s> during body repair without wrapping it in another head element", tag => {
    document.body.innerHTML = '<!--keep--><section><p>Keep</p></section><demo-widget></demo-widget>'
    const section = document.querySelector("section")!
    const paragraph = section.firstElementChild
    const widget = document.querySelector("demo-widget")!
    section.append(document.createElement(tag))

    editor.schema.checkAndCorrect(document.body, true)

    expect(document.body.innerHTML).toBe('<!--keep--><section><p>Keep</p></section><demo-widget></demo-widget>')
    expect(document.querySelector("section")).toBe(section)
    expect(section.firstElementChild).toBe(paragraph)
    expect(document.querySelector("demo-widget")).toBe(widget)
  })

  it("preserves widget data scripts under the widget's content contract", () => {
    const schema = new Schema()
    schema.extendWidgets([{tagName: "demo-widget", editingConfig: {content: "p*", sharedData: true}}])
    document.body.innerHTML = '<demo-widget><script type="application/json" slot="data">{"value":1}</script><p>Keep</p></demo-widget>'
    const widget = document.querySelector("demo-widget")!
    const data = widget.firstElementChild!
    expect(schema.isNodeValid(data)).toBe(true)
    expect(schema.isContentValid(widget)).toBe(true)
    const original = document.body.innerHTML
    schema.checkAndCorrect(document.body, true)
    expect(document.body.innerHTML).toBe(original)
    expect(widget.firstElementChild).toBe(data)
  })
})

describe("findWrapping()", () => {
  // it("can fix an invalid tree by lifting", () => {})
  it("can find a <li> wrapping", () => {
    expect(editor.schema.findWrapping(document.createElement("ul"), [document.createElement("p")])).toBeInstanceOf(HTMLLIElement)
  })
  // it("can fix an invalid tree by filling", () => {})
})

describe("fixInvalidContent()", () => {
  // it("can fix an invalid tree by lifting", () => {})
  it("can fix an invalid element by wrapping", () => {
    document.body.innerHTML = `<ul><p>hello</p></ul>`
    editor.schema.fixInvalidContent(document.querySelector("ul")!)
    expectBodyToBe(`<ul><li><p>hello</p></li></ul>`)
  })
  it("can fix an invalid text node by wrapping", () => {
    document.body.innerHTML = `<ul>hello</ul>`
    editor.schema.fixInvalidContent(document.querySelector("ul")!)
    expectBodyToBe(`<ul><li>hello</li></ul>`)
  })
  it("can fix invalid mixed inline content by wrapping", () => {
    document.body.innerHTML = `<ul>hello <b>world</b></ul>`
    editor.schema.fixInvalidContent(document.querySelector("ul")!)
    expectBodyToBe(`<ul><li>hello <b>world</b></li></ul>`)
  })
  // it("can fix an invalid tree by filling", () => {})
})

describe("table normalization", () => {
  it("preserves comments, section metadata and node identity, and is idempotent", () => {
    const table = document.createElement("table")
    table.innerHTML = '<!--table--><tbody id="records"><!--body--><tr><td>A</td></tr><!--between--><tr><td>B</td></tr></tbody>'
    const body = table.querySelector("tbody")!
    const last = table.querySelectorAll("tr")[1]
    normalizeTableStructure(table, true, false)
    expect(table.querySelector("tbody")).toBe(body)
    expect(table.querySelector("tbody")).toHaveAttribute("id", "records")
    expect(table.querySelectorAll("tr")[1]).toBe(last)
    expect(table.innerHTML).toContain("<!--table-->")
    expect(table.innerHTML).toContain("<!--body-->")
    expect(table.innerHTML).toContain("<!--between-->")
    const observer = new MutationObserver(() => {})
    observer.observe(table, {childList: true, subtree: true, attributes: true})
    normalizeTableStructure(table)
    expect(observer.takeRecords()).toEqual([])
    observer.disconnect()
  })

  it("preserves native table columns, metadata, and repeated row groups", () => {
    const table = document.createElement("table")
    table.setAttribute("role", "grid")
    table.innerHTML = '<caption>Results</caption><colgroup span="2"><col></colgroup><colgroup><col></colgroup><thead role="rowgroup"><tr><td headers="x">Heading</td></tr><tr><th scope="col" abbr="A">A</th></tr></thead><tbody><tr><th scope="row">First</th></tr></tbody><tbody role="rowgroup"><tr><td headers="first">Second</td></tr></tbody><tfoot><tr><td>Summary</td></tr><tr><th>Total</th></tr></tfoot>'
    const original = table.innerHTML

    editor.schema.checkAndCorrect(table, true)

    expect(table.innerHTML).toBe(original)
    expect(table.getAttribute("role")).toBe("grid")
    expect(table.querySelectorAll(":scope > colgroup")).toHaveLength(2)
    expect(table.querySelectorAll(":scope > tbody")).toHaveLength(2)
    expect(table.querySelector("th[scope='row']")).not.toBeNull()
    expect(table.querySelector("td[headers='x']")).not.toBeNull()
    expect(editor.schema.isContentValid(table)).toBe(true)
    expect(editor.schema.isContentValid(table.querySelector("tbody tr")!)).toBe(true)
    expect(editor.schema.isContentValid(table.querySelector("thead tr")!)).toBe(true)
  })

  it("leaves ordinary normalization calls unchanged", () => {
    const table = document.createElement("table")
    table.innerHTML = `<colgroup><col></colgroup><thead><tr><th headers="h">Head</th></tr><tr><th>Extra</th></tr></thead><tbody><tr><th scope="row">Body</th></tr></tbody><tfoot><tr><td>Old footer</td></tr><tr><td abbr="f">Footer</td></tr></tfoot>`
    const original = table.innerHTML
    normalizeTableStructure(table)
    expect(table.innerHTML).toBe(original)
  })

  it("uses explicit header and footer flags and produces schema-valid parsed tables", () => {
    document.body.innerHTML = `<table role="grid"><tr><td>First</td></tr><tr><th>Last</th></tr></table>`
    const table = document.querySelector("table")!
    normalizeTableStructure(table, true, false)
    expect(table.outerHTML).toBe(`<table role="grid"><thead><tr><th>First</th></tr></thead><tbody><tr><td>Last</td></tr></tbody></table>`)
    editor.schema.checkAndCorrect(table, true)
    expect(editor.schema.isContentValid(table)).toBe(true)
  })
})

describe("ensureStaticContent()", () => {
  it.each(["absolute", "fixed", "relative", "sticky"])("adds a paragraph alongside %s content", position => {
    document.body.innerHTML = `<demo-widget style="position: ${position}"><p>Nested</p></demo-widget><!--keep-->`
    const widget = document.body.firstElementChild!
    const paragraph = editor.schema.ensureStaticContent(document.body)
    expect(paragraph?.outerHTML).toBe("<p></p>")
    expect(document.body.firstElementChild).toBe(widget)
    expect(widget.innerHTML).toBe("<p>Nested</p>")
    expect(editor.schema.ensureStaticContent(document.body)).toBeNull()
    expect(document.body.children).toHaveLength(2)
  })

  it("keeps an existing static element and selection intact", () => {
    document.body.innerHTML = "<section><p>Keep</p></section>"
    const paragraph = document.querySelector("p")!
    $.move(paragraph, 0)
    expect(editor.schema.ensureStaticContent(document.body)).toBeNull()
    expect($.anchor).toBe(paragraph)
    expectBodyToBe("<section><p>Keep</p></section>")
  })

  it("preserves text and comments when adding the default element", () => {
    document.body.innerHTML = "Text<!--keep-->"
    editor.schema.ensureStaticContent(document.body)
    expect(document.body.innerHTML).toBe("Text<!--keep--><p></p>")
  })

  it("uses the configured default element", () => {
    const schema = new Schema({...Schema.baseSchema, p: {...Schema.baseSchema.p, defaultNode: false},
      div: {...Schema.baseSchema.div, defaultNode: true}})
    document.body.replaceChildren()
    expect(schema.ensureStaticContent(document.body)?.localName).toBe("div")
  })

  it("falls back to a paragraph when the schema has no default element", () => {
    document.body.replaceChildren()
    expect(new Schema({}).ensureStaticContent(document.body)?.localName).toBe("p")
  })

  it("uses computed styles and remains stable when CSS positions default paragraphs", () => {
    const style = document.createElement("style")
    style.textContent = "body > p { position: absolute !important; }"
    document.head.append(style)
    try {
      const paragraph = editor.schema.ensureStaticContent(document.body)!
      expect(paragraph).not.toBeNull()
      expect(getComputedStyle(paragraph).position).toBe("static")
      expect(editor.schema.ensureStaticContent(document.body)).toBeNull()
    }
    finally { style.remove() }
  })
})

describe("isNodeValid()", () => {


  const el = (tag: string, attrs: Record<string, string> = {}) => {
    const e = document.createElement(tag)
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v))
    return e
  }
  const text = (content = "x") => document.createTextNode(content)
  const comment = (content = "x") => document.createComment(content)

  describe("selector rules", () => {
    it("matches an element by tag selector", () => {
      expect(editor.schema.isNodeValid(el("p"), {selector: "p", max: Infinity})).toBe(true)
    })
    it("rejects a non-matching element", () => {
      expect(editor.schema.isNodeValid(el("div"), {selector: "p", max: Infinity})).toBe(false)
    })
    it("supports compound CSS selectors", () => {
      const rule = {selector: "img[usemap]", max: Infinity}
      expect(editor.schema.isNodeValid(el("img", {usemap: "#map"}), rule)).toBe(true)
      expect(editor.schema.isNodeValid(el("img"), rule)).toBe(false)
    })
    it("matches a text node with {type: 'text'}", () => {
      expect(editor.schema.isNodeValid(text(), {selector: {type: "text"}, max: Infinity})).toBe(true)
      expect(editor.schema.isNodeValid(el("p"), {selector: {type: "text"}, max: Infinity})).toBe(false)
    })
    it("matches a comment node with {type: 'comment'}", () => {
      expect(editor.schema.isNodeValid(comment(), {selector: {type: "comment"}, max: Infinity})).toBe(true)
      expect(editor.schema.isNodeValid(text(), {selector: {type: "comment"}, max: Infinity})).toBe(false)
    })
    it("rejects a text node against a string selector", () => {
      expect(editor.schema.isNodeValid(text(), {selector: "p", max: Infinity})).toBe(false)
    })
    it("consumes max across repeated calls (default max 1)", () => {
      const rule = {selector: "p"}
      expect(editor.schema.isNodeValid(el("p"), rule)).toBe(true)
      expect(editor.schema.isNodeValid(el("p"), rule)).toBe(false)
    })
    it("allows up to max matching nodes", () => {
      const rule = {selector: "p", min: 0, max: 2}
      expect(editor.schema.isNodeValid(el("p"), rule)).toBe(true)
      expect(editor.schema.isNodeValid(el("p"), rule)).toBe(true)
      expect(editor.schema.isNodeValid(el("p"), rule)).toBe(false)
    })
    it("rejects any node when max is 0", () => {
      expect(editor.schema.isNodeValid(el("p"), {selector: "p", min: 0, max: 0})).toBe(false)
    })
  })

  describe("group rules", () => {
    it("matches an element belonging to the group", () => {
      expect(editor.schema.isNodeValid(el("b"), {group: "phrasing", max: Infinity})).toBe(true)
    })
    it("rejects an element outside the group", () => {
      expect(editor.schema.isNodeValid(el("div"), {group: "phrasing", max: Infinity})).toBe(false)
    })
    it("matches text nodes through the '#text' group entry", () => {
      expect(editor.schema.isNodeValid(text(), {group: "phrasing", max: Infinity})).toBe(true)
      expect(editor.schema.isNodeValid(text(), {group: "flow", max: Infinity})).toBe(true)
    })
    it("matches comment nodes through the '#comment' group entry", () => {
      expect(editor.schema.isNodeValid(comment(), {group: "flow", max: Infinity})).toBe(true)
      expect(editor.schema.isNodeValid(comment(), {group: "phrasing", max: Infinity})).toBe(false)
    })
    it("counts an atomic noneditable element toward a required group", () => {
      const widget = el("my-widget", {contenteditable: "false"})
      const rule = {group: "flow", min: 1, max: Infinity}
      expect(editor.schema.isNodeValid(widget, rule)).toBe(true)
      expect(rule.min).toBe(0)
    })
    it("rejects unknown elements (group matching is by tag name)", () => {
      expect(editor.schema.isNodeValid(el("my-widget"), {group: "flow", max: Infinity})).toBe(false)
    })
    it("consumes max across repeated calls", () => {
      const rule = {group: "phrasing", min: 0, max: 2}
      expect(editor.schema.isNodeValid(el("b"), rule)).toBe(true)
      expect(editor.schema.isNodeValid(el("i"), rule)).toBe(true)
      expect(editor.schema.isNodeValid(el("b"), rule)).toBe(false)
    })
  })

  describe("choice rules (options)", () => {
    it("accepts a node matching any option", () => {
      const rule = {options: [{selector: "b", max: Infinity}, {selector: {type: "text"}, max: Infinity}], max: Infinity}
      expect(editor.schema.isNodeValid(el("b"), rule as any)).toBe(true)
      expect(editor.schema.isNodeValid(text(), rule as any)).toBe(true)
    })
    it("rejects a node matching no option", () => {
      const rule = {options: [{selector: "b", max: Infinity}, {selector: "i", max: Infinity}], max: Infinity}
      expect(editor.schema.isNodeValid(el("u"), rule)).toBe(false)
    })
    it("rejects any node for an empty options list", () => {
      expect(editor.schema.isNodeValid(el("p"), {options: [], max: Infinity})).toBe(false)
    })
    it("consumes the outer max across repeated calls", () => {
      const rule = {options: [{selector: "p", max: Infinity}], min: 0, max: 2}
      expect(editor.schema.isNodeValid(el("p"), rule)).toBe(true)
      expect(editor.schema.isNodeValid(el("p"), rule)).toBe(true)
      expect(editor.schema.isNodeValid(el("p"), rule)).toBe(false)
    })
    it("accepts repeated matches of the same option in an unbounded choice (as used for <ul> in the base schema)", () => {
      const rule = {options: [{selector: "li"}, {selector: "script"}], min: 0, max: Infinity}
      expect(editor.schema.isNodeValid(el("li"), rule)).toBe(true)
      expect(editor.schema.isNodeValid(el("li"), rule)).toBe(true)
    })
  })

  describe("conjunction rules (conditions)", () => {
    it("accepts a node matching all conditions", () => {
      const rule = {conditions: [{group: "phrasing", max: Infinity}, {selector: ":not([data-x])", max: Infinity}], max: Infinity}
      expect(editor.schema.isNodeValid(el("b"), rule)).toBe(true)
    })
    it("rejects a node failing one condition", () => {
      const rule = {conditions: [{group: "phrasing", max: Infinity}, {selector: ":not([data-x])", max: Infinity}], max: Infinity}
      expect(editor.schema.isNodeValid(el("b", {"data-x": ""}), rule)).toBe(false)
    })
    it("rejects any node for an empty conditions list", () => {
      expect(editor.schema.isNodeValid(el("p"), {conditions: [], max: Infinity})).toBe(false)
    })
    it("allows up to max matching nodes", () => {
      const rule = {conditions: [{selector: "p", max: Infinity}], max: 2}
      expect(editor.schema.isNodeValid(el("p"), rule)).toBe(true)
      expect(editor.schema.isNodeValid(el("p"), rule)).toBe(true)
      expect(editor.schema.isNodeValid(el("p"), rule)).toBe(false)
    })
  })

  describe("sequence rules (terms)", () => {
    it("accepts nodes in sequence order", () => {
      const rule = {terms: [{selector: "head"}, {selector: "body"}]}
      expect(editor.schema.isNodeValid(el("head"), rule)).toBe(true)
      expect(editor.schema.isNodeValid(el("body"), rule)).toBe(true)
    })
    it("rejects nodes out of sequence order", () => {
      const rule = {terms: [{selector: "head"}, {selector: "body"}]}
      expect(editor.schema.isNodeValid(el("body"), rule)).toBe(false)
    })
    it("consumes the sequence once all terms are satisfied", () => {
      const rule = {terms: [{selector: "dt"}, {selector: "dd"}]}
      expect(editor.schema.isNodeValid(el("dt"), rule)).toBe(true)
      expect(editor.schema.isNodeValid(el("dd"), rule)).toBe(true)
      expect(editor.schema.isNodeValid(el("dd"), rule)).toBe(false)
    })
    it("rejects any node for an empty terms list", () => {
      expect(editor.schema.isNodeValid(el("p"), {terms: [], max: Infinity})).toBe(false)
    })
    it("skips optional terms that don't match (as used for <figure> in the base schema)", () => {
      const rule = {terms: [{selector: "figcaption", min: 0, max: 1}, {selector: "p"}]}
      expect(editor.schema.isNodeValid(el("p"), rule)).toBe(true)
    })
    it("advances past a repeatable term to the next one (as used for <hgroup> in the base schema)", () => {
      const rule = {terms: [{selector: "p", min: 0, max: Infinity}, {selector: "h1"}]}
      expect(editor.schema.isNodeValid(el("p"), rule)).toBe(true)
      expect(editor.schema.isNodeValid(el("h1"), rule)).toBe(true)
    })
    it("keeps an optional repeatable final term open after its required prefix", () => {
      const details = el("details")
      details.append(el("summary"), el("p"), el("p"))

      expect(editor.schema.isContentValid(details)).toBe(true)
    })
    it("limits summary content to phrasing content", () => {
      const summary = el("summary")
      summary.append(el("b"), text())
      expect(editor.schema.isContentValid(summary)).toBe(true)
      summary.append(el("p"))
      expect(editor.schema.isContentValid(summary)).toBe(false)
    })
  })

  describe("transparent rules", () => {
    it("preserves text and mixed phrasing inside links during correction", () => {
      const p = el("p")
      p.innerHTML = '<a href="https://example.com">one <b>two</b> three</a>'
      const link = p.firstElementChild!
      expect(editor.schema.isContentValid(link)).toBe(true)
      expect(editor.schema.findValidContentTypes(link)).toContain("#text")
      editor.schema.checkAndCorrect(p, true)
      expect(p.innerHTML).toBe('<a href="https://example.com">one <b>two</b> three</a>')
      link.append(document.createElement("button"))
      expect(editor.schema.isContentValid(link)).toBe(false)
    })
    it("resolves against the parent's content rule", () => {
      const p = el("p"); const b = el("b"); p.append(b)
      expect(editor.schema.isNodeValid(b, {transparent: true})).toBe(true)
    })
    it("rejects nodes invalid in the parent's content rule", () => {
      const p = el("p"); const div = el("div"); p.append(div)
      expect(editor.schema.isNodeValid(div, {transparent: true})).toBe(false)
    })
    it("combines its own selector with the parent's content rule", () => {
      const p = el("p"); const b = el("b"); const i = el("i"); p.append(b, i)
      expect(editor.schema.isNodeValid(b, {transparent: true, selector: "b"})).toBe(true)
      expect(editor.schema.isNodeValid(i, {transparent: true, selector: "b"})).toBe(false)
    })
    it("rejects detached nodes (no parent to resolve against)", () => {
      expect(editor.schema.isNodeValid(el("b"), {transparent: true})).toBe(false)
    })
  })

  describe("default rule (derived from the parent element)", () => {
    it("validates a node against its parent's content rule", () => {
      const ul = el("ul"); const li = el("li"); ul.append(li)
      expect(editor.schema.isNodeValid(li)).toBe(true)
    })
    it("rejects a node invalid in its parent", () => {
      const ul = el("ul"); const p = el("p"); ul.append(p)
      expect(editor.schema.isNodeValid(p)).toBe(false)
    })
    it("validates text inside a phrasing container", () => {
      const p = el("p"); const t = text("hello"); p.append(t)
      expect(editor.schema.isNodeValid(t)).toBe(true)
    })
    it("rejects content inside an element without a content rule", () => {
      const br = el("br"); const t = text("hello"); br.append(t)
      expect(editor.schema.isNodeValid(t)).toBe(false)
    })
  })

  describe("edge cases and compositions", () => {
    it("treats elements with contenteditable=false as always valid", () => {
      const div = el("div", {contenteditable: "false"})
      expect(editor.schema.isNodeValid(div, {selector: "p"})).toBe(true)
    })
    it("throws on a malformed rule", () => {
      expect(() => editor.schema.isNodeValid(el("p"), {min: 1} as any)).toThrow(TypeError)
    })
    it("supports a choice nested in a sequence", () => {
      const rule = () => ({terms: [{selector: "head"}, {options: [{selector: "body"}, {selector: "frameset"}]}]})
      const accepting = rule()
      expect(editor.schema.isNodeValid(el("head"), accepting)).toBe(true)
      expect(editor.schema.isNodeValid(el("body"), accepting)).toBe(true)
      const rejecting = rule()
      expect(editor.schema.isNodeValid(el("head"), rejecting)).toBe(true)
      expect(editor.schema.isNodeValid(el("div"), rejecting)).toBe(false)
    })
    it("supports a conjunction nested in a choice", () => {
      const rule = {options: [{conditions: [{selector: "p", max: Infinity}, {group: "flow", max: Infinity}], max: Infinity}, {selector: {type: "text"}, max: Infinity}], max: Infinity}
      expect(editor.schema.isNodeValid(el("p"), rule as any)).toBe(true)
      expect(editor.schema.isNodeValid(text(), rule as any)).toBe(true)
      expect(editor.schema.isNodeValid(el("div"), rule as any)).toBe(false)
    })
    it("validates a group restricted by selector through a conjunction", () => {
      const rule = {conditions: [{group: "phrasing", max: Infinity}, {selector: ":not(audio):not(:has(audio))", max: Infinity}], max: Infinity}
      const span = el("span"); span.append(el("b"))
      expect(editor.schema.isNodeValid(span, rule)).toBe(true)
      const spanWithAudio = el("span"); spanWithAudio.append(el("audio"))
      expect(editor.schema.isNodeValid(spanWithAudio, rule)).toBe(false)
    })
  })
})
describe("Schema methods", () => {

  let schema: Schema

  beforeEach(() => {
    schema = new Schema(structuredClone(Schema.baseSchema))
  })

  const el = (tag: string) => document.createElement(tag)
  const text = (content = "x") => document.createTextNode(content)

  describe("extend()", () => {
    it("registers new node types", () => {
      schema.extend({"x-widget": {group: ["flow"], content: {group: "phrasing", min: 0, max: Infinity}}})
      expect(schema.get("x-widget")).toBeDefined()
      expect(schema.getGroupMembers("flow")).toContain("x-widget")
    })
    it("overrides existing entries", () => {
      schema.extend({"p": {group: ["flow"]}})
      expect(schema.get("p").content).toBeUndefined()
    })
    it("keeps existing node prototypes available after an extension", () => {
      schema.extend({"x-widget": {group: ["flow"]}})
      expect(schema.findValidContentTypes("body")).toEqual(expect.arrayContaining(["p", "div", "x-widget"]))
    })
    it("uses inert nodes for schema probes while create() still constructs widgets", () => {
      const tag = `schema-probe-${Math.random().toString(36).slice(2)}`
      let constructorCalls = 0
      customElements.define(tag, class extends HTMLElement {
        constructor() {
          super()
          constructorCalls++
        }
      })
      schema.extend({[tag]: {
        group: ["flow"],
        content: {selector: "p", min: 0, max: Infinity},
      }})

      expect(constructorCalls).toBe(0)
      expect(schema.isContentValid(tag, [])).toBe(true)
      expect(schema.findValidContentTypes(tag)).toEqual(["p"])
      expect(schema.fillByRule(tag, undefined, [])).toEqual([])
      expect(constructorCalls).toBe(0)

      const widget = schema.create(tag)
      expect(widget).toBeInstanceOf(HTMLElement)
      expect(constructorCalls).toBe(1)

      const wrapper = el("div")
      wrapper.append(el("p"), widget)
      document.body.append(wrapper)
      expect(schema.canSplit(widget)).toBe(true)
      const liftTarget = schema.getLiftTarget(widget)
      expect(liftTarget?.[1].at(-1)).toBe(widget)
      expect(constructorCalls).toBe(1)
    })
    it("updates rather than duplicates group membership when overriding a type", () => {
      schema.extend({"x-widget": {group: ["flow"]}})
      schema.extend({"x-widget": {group: ["phrasing"]}})
      expect(schema.getGroupMembers("flow")).not.toContain("x-widget")
      expect(schema.getGroupMembers("phrasing").filter(key => key === "x-widget")).toEqual(["x-widget"])
    })
  })

  describe("extendWidgets()", () => {
    it("turns widget groups and nested content expressions into schema entries", () => {
      schema.extendWidgets([{
        tagName: "webwriter-slides",
        editingConfig: {content: "webwriter-slide+"},
      }, {
        tagName: "webwriter-slide",
        editingConfig: {group: "", content: "(p | flow)+", isolating: false},
      }])
      const slides = el("webwriter-slides")
      const first = el("webwriter-slide"); first.append(el("p"))
      const second = el("webwriter-slide"); second.append(el("h2"), el("p"))
      slides.append(first, second)

      expect(schema.getGroupMembers("flow")).toContain("webwriter-slides")
      expect(schema.getGroupMembers("flow")).not.toContain("webwriter-slide")
      expect(schema.get("webwriter-slide").inseperable).toBe(false)
      expect(schema.isContentValid(document.body, [slides])).toBe(true)
      expect(schema.isContentValid(slides)).toBe(true)
      expect(schema.isContentValid(first)).toBe(true)
      expect(schema.isContentValid("webwriter-slides", [])).toBe(false)
      expect(schema.isContentValid("webwriter-slides", [el("p")])).toBe(false)
    })

    it("supports ordered widget children, optional nodes and custom groups", () => {
      schema.extendWidgets([{
        tagName: "webwriter-task",
        editingConfig: {content: "webwriter-prompt webwriter-hint? answer"},
      }, {
        tagName: "webwriter-prompt",
        editingConfig: {group: "", content: "flow+"},
      }, {
        tagName: "webwriter-hint",
        editingConfig: {group: "", content: "p"},
      }, {
        tagName: "webwriter-answer",
        editingConfig: {group: "answer"},
      }])
      const prompt = el("webwriter-prompt"); prompt.append(el("p"))
      const hint = el("webwriter-hint"); hint.append(el("p"))
      const answer = el("webwriter-answer")

      expect(schema.isContentValid("webwriter-task", [prompt, answer])).toBe(true)
      expect(schema.isContentValid("webwriter-task", [prompt, hint, answer])).toBe(true)
      expect(schema.isContentValid("webwriter-task", [answer, prompt])).toBe(false)
      expect(schema.findValidContentTypes("webwriter-task")).toEqual(["webwriter-prompt"])
      expect(schema.findValidContentTypes("webwriter-task", undefined, [prompt]))
        .toEqual(expect.arrayContaining(["webwriter-hint", "webwriter-answer"]))
    })

    it("supports editable text content and bounded repetitions", () => {
      schema.extendWidgets([{
        tagName: "webwriter-labels",
        editingConfig: {content: "webwriter-label{1,2}"},
      }, {
        tagName: "webwriter-label",
        editingConfig: {group: "", content: "text*"},
      }])
      const label = (value: string) => {
        const node = el("webwriter-label")
        node.append(text(value))
        return node
      }

      expect(schema.isContentValid("webwriter-label", [text("editable")])).toBe(true)
      expect(schema.isContentValid("webwriter-labels", [label("one")])).toBe(true)
      expect(schema.isContentValid("webwriter-labels", [label("one"), label("two")])).toBe(true)
      expect(schema.isContentValid("webwriter-labels", [])).toBe(false)
      expect(schema.isContentValid("webwriter-labels", [label("one"), label("two"), label("three")])).toBe(false)
    })

    it("rejects references to nodes or groups not present in the installed schema", () => {
      expect(() => schema.extendWidgets([{
        tagName: "webwriter-broken",
        editingConfig: {content: "missing-child+"},
      }])).toThrow(SyntaxError)
    })
  })

  describe("findAlternativeIndex()", () => {
    const constrainedContainer = (content: string, children: string[]) => {
      schema.extend({"x-constrained": {content: {terms: content.split(" ").map(selector => ({selector}))}}})
      const container = el("x-constrained")
      container.append(...children.map(el))
      return container
    }

    it("finds a valid earlier position", () => {
      const container = constrainedContainer("h1 p", ["p", "h1"])
      const heading = container.lastChild!

      expect(schema.findAlternativeIndex(container, [heading])).toBe(0)
    })

    it("finds a valid later position at the end", () => {
      const container = constrainedContainer("p h1", ["h1", "p"])
      const heading = container.firstChild!

      expect(schema.findAlternativeIndex(container, [heading])).toBe(1)
    })

    it("returns null when no position can make the container valid", () => {
      const container = constrainedContainer("p", ["h1"])
      const invalid = container.firstChild!

      expect(schema.findAlternativeIndex(container, [invalid])).toBeNull()
    })

    it("does not pass undefined placeholders to content validation", () => {
      const container = constrainedContainer("h1 p", ["p", "h1"])
      const heading = container.lastChild!
      const validation = vi.spyOn(schema, "isContentValid")

      schema.findAlternativeIndex(container, [heading])

      expect(validation.mock.calls
        .map(([, content]) => content)
        .filter((content): content is Node[] => Array.isArray(content))
        .every(content => content.every(Boolean))).toBe(true)
    })
  })

  describe("defaultNodeKey/defaultNodeType", () => {
    it("returns the type marked as defaultNode", () => {
      expect(schema.defaultNodeKey).toBe("p")
      expect(schema.defaultNodeType).toBe(schema.get("p"))
    })
    it("falls back to '#text' without a default node", () => {
      const minimal = new Schema({"#text": {group: ["flow"]}})
      expect(minimal.defaultNodeKey).toBe("#text")
    })
  })

  describe("get()", () => {
    it("returns the entry for a key", () => {
      expect(schema.get("ul").content).toBeDefined()
    })
    it("returns the same entry for an element of that type", () => {
      expect(schema.get(el("ul"))).toBe(schema.get("ul"))
    })
    it("maps text and comment nodes to their entries", () => {
      expect(schema.get(text())).toBe(schema.get("#text"))
      expect(schema.get(document.createComment("x"))).toBe(schema.get("#comment"))
    })
    it("maps unknown elements to '#unknownelement'", () => {
      expect(schema.get(el("x-unknown"))).toBe(schema.get("#unknownelement"))
    })
    it("resolves namespaced entries for elements in a namespace container", () => {
      const svg = schema.create("svg") as Element
      const rect = schema.create("svg|rect") as Element
      svg.append(rect)
      expect(schema.get("svg|rect")).toBeDefined()
      expect(schema.get(rect)).toBe(schema.get("svg|rect"))
    })
    it("includes complete SVG and MathML descendants in the default schema", () => {
      const svg = schema.create("svg") as Element
      svg.append(schema.create("svg|rect"))
      const math = schema.create("math") as Element
      const row = schema.create("math|mrow") as Element
      const superscript = schema.create("math|msup") as Element
      const identifier = schema.create("math|mi") as Element; identifier.append("a")
      const exponent = schema.create("math|mn") as Element; exponent.append("2")
      superscript.append(identifier, exponent)
      row.append(superscript, schema.create("math|mo"))
      math.append(row)

      expect(schema.get("math|mrow")).toBeDefined()
      expect(schema.isContentValid(svg)).toBe(true)
      expect(schema.isContentValid(math)).toBe(true)
      expect(schema.isContentValid(row)).toBe(true)
      expect(schema.isContentValid(superscript)).toBe(true)
      expect(schema.isContentValid(identifier)).toBe(true)
    })
    it("distinguishes foreign-namespace roots from their nested element types", () => {
      const svg = schema.create("svg") as Element
      const nestedSvg = schema.create("svg|svg") as Element
      const math = schema.create("math") as Element

      expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg")
      expect(math.namespaceURI).toBe("http://www.w3.org/1998/Math/MathML")
      expect(schema.get(svg)).toBe(schema.get("svg"))
      expect(schema.get(nestedSvg)).toBe(schema.get("svg|svg"))
      expect(schema.get(math)).toBe(schema.get("math"))
      expect(schema.isContentValid("body", [svg, math])).toBe(true)

      const parsedSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
      const parsedMath = document.createElementNS("http://www.w3.org/1998/Math/MathML", "math")
      expect(schema.get(parsedSvg)).toBe(schema.get("svg"))
      expect(schema.get(parsedMath)).toBe(schema.get("math"))
    })
    it("throws for unsupported node types", () => {
      expect(() => schema.get(document as any)).toThrow(TypeError)
    })
  })

  describe("create() (extended)", () => {
    it("creates the default node without a key", () => {
      expect(schema.create()).toBeInstanceOf(HTMLParagraphElement)
    })
    it("creates namespaced elements", () => {
      const rect = schema.create("svg|rect") as Element
      expect(rect.namespaceURI).toBe("http://www.w3.org/2000/svg")
      expect(rect.nodeName).toBe("rect")
    })
  })

  describe("placeholderKeys", () => {
    it.each(["h1", "h2", "h3", "h4", "h5", "h6"])("uses Heading as the empty %s placeholder", tag => {
      const type = schema.get(tag)
      expect(type.placeholderStyle?.content).toBe('"Heading"')
    })

    it("contains types with an empty selector and placeholder or empty style", () => {
      expect(schema.placeholderKeys).toEqual(expect.arrayContaining(["h1", "h2", "h3", "h4", "h5", "h6"]))
      expect(schema.placeholderKeys).not.toContain("p")
    })
  })

  describe("namespaceTypes/getNamespaceURL()", () => {
    it("lists the types defining a content namespace", () => {
      expect(Object.keys(schema.namespaceTypes)).toContain("svg")
      expect(Object.keys(schema.namespaceTypes)).toContain("math")
    })
    it("returns the namespace URL of a type", () => {
      expect(schema.getNamespaceURL("svg")).toBe("http://www.w3.org/2000/svg")
    })
  })

  describe("getNamespaceNameOfElement()/getNamespaceOfElement()", () => {
    it("returns the namespace of an element inside a namespace container", () => {
      const svg = schema.create("svg") as Element
      const rect = schema.create("svg|rect") as Element
      svg.append(rect)
      expect(schema.getNamespaceNameOfElement(rect)).toBe("svg")
      expect(schema.getNamespaceOfElement(rect)).toBe("http://www.w3.org/2000/svg")
    })
    it("is undefined outside any namespace container", () => {
      const p = el("p"); document.body.append(p)
      expect(schema.getNamespaceNameOfElement(p)).toBeUndefined()
      expect(schema.getNamespaceOfElement(p)).toBeUndefined()
    })
    it("is undefined for the namespace container itself", () => {
      const svg = schema.create("svg") as Element
      document.body.append(svg)
      expect(schema.getNamespaceNameOfElement(svg)).toBeUndefined()
    })
  })

  describe("isPhrasing()", () => {
    it("is true for phrasing content, by key or node", () => {
      expect(schema.isPhrasing("b")).toBeTruthy()
      expect(schema.isPhrasing(el("b"))).toBeTruthy()
    })
    it("is false for non-phrasing content", () => {
      expect(schema.isPhrasing("div")).toBeFalsy()
    })
  })

  describe("isBlock()", () => {
    it("is true for elements with phrasing content", () => {
      expect(schema.isBlock("p")).toBe(true)
    })
    it("is false for elements without phrasing content", () => {
      expect(schema.isBlock("ul")).toBe(false)
    })
  })

  describe("getGroupMembers()", () => {
    it("returns the members of a group", () => {
      expect(schema.getGroupMembers("phrasing")).toContain("b")
      expect(schema.getGroupMembers("phrasing")).toContain("#text")
    })
    it("returns a copy", () => {
      schema.getGroupMembers("phrasing").push("bogus")
      expect(schema.getGroupMembers("phrasing")).not.toContain("bogus")
    })
    it("should return an empty array for unknown groups", () => {
      expect(schema.getGroupMembers("bogus").length).toEqual(0)
    })
  })

  describe("canReplace()", () => {
    it("allows replacing with a node valid in the parent", () => {
      const ul = el("ul"); const li = el("li"); ul.append(li)
      expect(schema.canReplace(li, el("li"))).toBe(true)
    })
    it("rejects replacing with an invalid node", () => {
      const ul = el("ul"); const li = el("li"); ul.append(li)
      expect(schema.canReplace(li, el("p"))).toBe(false)
    })
    it("is false for nodes without a parent", () => {
      expect(schema.canReplace(el("li"), el("li"))).toBe(false)
    })
  })

  describe("canInsert()", () => {
    it("allows inserting a valid node at an index", () => {
      const body = document.body; body.append(el("p"))
      expect(schema.canInsert(body, el("p"), 1)).toBe(true)
    })
    it("rejects inserting an invalid node", () => {
      expect(schema.canInsert(document.body, el("title"), 0)).toBe(false)
    })
    it("can replace a child range", () => {
      document.body.append(el("p"))
      expect(schema.canInsert(document.body, el("div"), 0, 1)).toBe(true)
    })
    it("is false for containers without a content rule", () => {
      expect(schema.canInsert(el("br"), text(), 0)).toBe(false)
    })
  })

  describe("canSplit()", () => {
    it("is true when the parent can hold the node and its clone", () => {
      const p = el("p"); document.body.append(p)
      expect(schema.canSplit(p)).toBe(true)
    })
    it("keeps the node's siblings in place", () => {
      const p1 = el("p"); const p2 = el("p"); document.body.append(p1, p2)
      expect(schema.canSplit(p1)).toBe(true)
    })
    it("is false when the parent does not allow a second node of that type", () => {
      expect(schema.canSplit(document.head)).toBe(false)
    })
    it("accepts a valid insertee between the two halves", () => {
      const p = el("p"); document.body.append(p)
      expect(schema.canSplit(p, el("div"))).toBe(true)
    })
    it("rejects an insertee that is invalid in the parent", () => {
      const p = el("p"); document.body.append(p)
      expect(schema.canSplit(p, el("title"))).toBe(false)
    })
    it("is false for nodes without a parent", () => {
      expect(schema.canSplit(el("p"))).toBe(false)
    })
  })

  describe("canWrap()", () => {
    it("allows wrapping content valid in the wrapper", () => {
      expect(schema.canWrap("li", [text("hello")])).toBe(true)
      expect(schema.canWrap(el("li"), [el("p")])).toBe(true)
    })
    it("rejects wrapping invalid content", () => {
      expect(schema.canWrap("ul", [el("p")])).toBe(false)
    })
  })

  describe("getLiftTarget()", () => {
    it("finds a lift target one level up", () => {
      document.body.innerHTML = "<div><p>x</p></div>"
      const p = document.querySelector("p")!
      const [depth, liftInsert] = schema.getLiftTarget(p) ?? []
      expect(depth).toBe(1)
      expect(liftInsert).toEqual([p])
    })
    it("splits the parent around the lifted node", () => {
      document.body.innerHTML = "<div><p>a</p><p>b</p><p>c</p></div>"
      const middle = document.querySelectorAll("p").item(1)
      const [, liftInsert] = schema.getLiftTarget(middle) ?? []
      expect(liftInsert).toHaveLength(3)
      expect(liftInsert![1]).toBe(middle)
      expect((liftInsert![0] as Element).outerHTML).toBe("<div><p>a</p></div>")
      expect((liftInsert![2] as Element).outerHTML).toBe("<div><p>c</p></div>")
    })
    it("leaves the document unchanged when a target is found", () => {
      document.body.innerHTML = "<div><p>a</p><p>b</p><p>c</p></div>"
      schema.getLiftTarget(document.querySelectorAll("p").item(1))
      expect(document.body.innerHTML).toBe("<div><p>a</p><p>b</p><p>c</p></div>")
    })
    it("leaves the document unchanged when no target is found", () => {
      document.body.innerHTML = "<ul><li>a</li><li>b</li></ul>"
      expect(schema.getLiftTarget(document.querySelectorAll("li").item(1))).toBeNull()
      expect(document.body.innerHTML).toBe("<ul><li>a</li><li>b</li></ul>")
    })
    it("returns null when lifting would slice an inseperable parent", () => {
      document.body.innerHTML = "<h1>a<b>x</b>c</h1>"
      expect(schema.getLiftTarget(document.querySelector("b")!)).toBeNull()
    })
    it("returns null when the node is valid nowhere up the tree", () => {
      document.body.innerHTML = "<ul><li>x</li></ul>"
      expect(schema.getLiftTarget(document.querySelector("li")!)).toBeNull()
    })
    it("returns null for nodes directly in the body", () => {
      document.body.innerHTML = "<p>x</p>"
      expect(schema.getLiftTarget(document.querySelector("p")!)).toBeNull()
    })
  })

  describe("findInvalidNodes()", () => {
    it("collects elements with invalid content", () => {
      document.body.innerHTML = "<div><ul><p>x</p></ul></div>"
      expect(schema.findInvalidNodes(document.body.firstElementChild!)).toEqual([document.querySelector("ul")])
    })
    it("is empty for a valid tree", () => {
      document.body.innerHTML = "<div><p>x</p></div>"
      expect(schema.findInvalidNodes(document.body.firstElementChild!)).toEqual([])
    })
  })

  describe("isContentValid()", () => {
    it("accepts valid children", () => {
      const ul = el("ul"); ul.append(el("li"))
      expect(schema.isContentValid(ul)).toBe(true)
    })
    it("rejects invalid children", () => {
      const ul = el("ul"); ul.append(el("p"))
      expect(schema.isContentValid(ul)).toBe(false)
    })
    it("accepts a key with explicit content", () => {
      expect(schema.isContentValid("ul", [el("li")])).toBe(true)
    })
    it("is true for non-element nodes", () => {
      expect(schema.isContentValid(text())).toBe(true)
    })
    it("enforces the minimum content count", () => {
      expect(schema.isContentValid("html", [])).toBe(false)
      expect(schema.isContentValid("html", [el("head"), el("body")])).toBe(true)
      expect(schema.isContentValid("body", [])).toBe(false)
    })
    it("treats an empty element without a content rule as valid", () => {
      expect(schema.isContentValid(el("br"))).toBe(true)
    })
  })

  describe("fillByRule()", () => {
    it("fills required content", () => {
      const content = schema.fillByRule("html")
      expect(content.map(n => n.nodeName)).toEqual(["HEAD", "BODY"])
    })
    it("fills an empty body with its default paragraph", () => {
      expect(schema.fillByRule("body").map(node => node.nodeName)).toEqual(["P"])
    })
    it("completes partial content", () => {
      const head = el("head")
      const content = schema.fillByRule("html", undefined, [head])
      expect(content[0]).toBe(head)
      expect(content.map(n => n.nodeName)).toEqual(["HEAD", "BODY"])
    })
    it("returns already valid content unchanged", () => {
      const content = [el("p")]
      expect(schema.fillByRule("body", undefined, content)).toBe(content)
    })
    it("throws for containers without a content rule", () => {
      expect(() => schema.fillByRule("br")).toThrow()
    })
    it("throws when content cannot be placed", () => {
      expect(() => schema.fillByRule("ul", {selector: "li", min: 1, max: 1}, [el("p")])).toThrow()
    })
  })

  describe("findValidContentTypes()", () => {
    it("lists the selector options of a type", () => {
      expect(schema.findValidContentTypes("ul")).toEqual(["li"])
    })
    it("lists group members for group rules", () => {
      const types = schema.findValidContentTypes("body")
      expect(types).toContain("p")
      expect(types).toContain("div")
    })
    it("lists phrasing types and text for paragraphs", () => {
      const types = schema.findValidContentTypes("p")
      expect(types).toContain("b")
      expect(types).toContain("#text")
      expect(types).not.toContain("div")
    })
    it("returns the first unsatisfied term of a sequence", () => {
      expect(schema.findValidContentTypes("html")).toEqual(["head"])
    })
    it("is empty for an exhausted rule", () => {
      expect(schema.findValidContentTypes(el("ul"), {selector: "li", min: 0, max: 0})).toEqual([])
    })
    it("is empty for non-element containers", () => {
      expect(schema.findValidContentTypes(text())).toEqual([])
    })
    it("resolves transparent rules against the parent", () => {
      const p = el("p"); const slot = el("slot"); p.append(slot)
      const types = schema.findValidContentTypes(slot)
      expect(types).toContain("b")
      expect(types).not.toContain("div")
    })
    it("is empty for detached transparent containers", () => {
      expect(schema.findValidContentTypes(el("slot"))).toEqual([])
    })
  })

  describe("findWrapping() (extended)", () => {
    it("wraps text in a <li> for lists", () => {
      expect(schema.findWrapping(el("ul"), [text("hello")])).toBeInstanceOf(HTMLLIElement)
    })
    it("returns no wrapping when nothing fits", () => {
      expect(schema.findWrapping(el("p"), [el("html")])).toBeUndefined()
    })
  })

  describe("getInvalidChildNodes()", () => {
    it("returns the invalid children", () => {
      const ul = el("ul"); const li = el("li"); const p = el("p"); ul.append(li, p)
      expect(schema.getInvalidChildNodes(ul)).toEqual([p])
    })
    it("is empty for valid content", () => {
      const ul = el("ul"); ul.append(el("li"))
      expect(schema.getInvalidChildNodes(ul)).toEqual([])
    })
  })

  describe("checkAndCorrect()", () => {
    it("fixes the content of the root", () => {
      document.body.innerHTML = "<ul>x</ul>"
      schema.checkAndCorrect(document.querySelector("ul")!)
      expectBodyToBe("<ul><li>x</li></ul>")
    })
    it("fixes descendants when deep", () => {
      document.body.innerHTML = "<div><ul>x</ul></div>"
      schema.checkAndCorrect(document.querySelector("div")!, true)
      expectBodyToBe("<div><ul><li>x</li></ul></div>")
    })
    it("ignores non-element roots", () => {
      expect(() => schema.checkAndCorrect(text())).not.toThrow()
    })
  })

  describe("findValidTypesToInsert()", () => {
    it("allows body insertion after summary and only phrasing insertion at its leading edge", () => {
      document.body.innerHTML = '<details open><summary>Summary</summary><p>Body</p></details>'
      const details = document.querySelector("details")!
      for(const offset of [1, 2]) {
        $.move(details, offset)
        expect(schema.findValidTypesToInsert()).toContain("p")
        expect(schema.findValidTypesToInsert()).not.toContain("summary")
      }
      $.move(details, 0)
      expect($.anchor).toBe(details.querySelector("summary"))
      expect(schema.findValidTypesToInsert()).toContain("b")
      expect(schema.findValidTypesToInsert()).not.toContain("summary")
      expect(schema.findValidTypesToInsert()).not.toContain("p")
      const leadingRange = document.createRange()
      leadingRange.setStart(details, 0)
      leadingRange.collapse(true)
      expect(schema.findValidTypesToInsert(leadingRange)).toEqual([])
    })

    it("returns the types insertable at the selection", () => {
      document.body.innerHTML = "<p>x</p>"
      $.move(document.body, 1)
      const types = schema.findValidTypesToInsert()
      expect(types).toContain("p")
      expect(types).toContain("div")
    })

    it("keeps ruby internals available to structured commands but out of generic insertion", () => {
      document.body.innerHTML = "<p><ruby>漢</ruby></p>"
      const ruby = document.querySelector("ruby")!
      $.move(ruby, 1)

      expect(schema.findValidContentTypes(ruby, undefined, Array.from(ruby.childNodes)))
        .toEqual(expect.arrayContaining(["rt", "rp"]))
      expect(schema.findValidTypesToInsert()).not.toContain("rt")
      expect(schema.findValidTypesToInsert()).not.toContain("rp")
    })
  })
})

describe("media constraints", () => {
  it("retains a standalone image's column placement on its media wrapper", () => {
    const group = document.createElement("div")
    group.className = "ww-column-group"
    group.innerHTML = '<p class="ww-column-left">Left</p><img class="authored ww-column-right" alt="Right">'
    const image = group.querySelector("img")!
    editor.schema.enforceMedia(group)
    expect(group.querySelector(":scope > picture.ww-column-right > img")).toBe(image)
    expect(image.className).toBe("authored")
    expect(group.querySelector(".ww-column-left")!.textContent).toBe("Left")
  })

  it("wraps standalone images without replacing them or touching widgets", () => {
    const body = document.createElement("body")
    body.innerHTML = '<p><!--keep--><img alt="First"><img alt="Second"></p><picture><source srcset="wide.png"><img></picture><media-widget><img><video></video><embed></media-widget>'
    const images = Array.from(body.querySelectorAll("img"))
    editor.schema.enforceMedia(body)
    expect(body.querySelectorAll("p > picture > img")).toHaveLength(2)
    expect(Array.from(body.querySelectorAll("img"))).toEqual(images)
    expect(body.querySelectorAll("picture")).toHaveLength(3)
    expect(body.querySelector("media-widget")!.innerHTML).toBe('<img><video></video><embed>')
    const html = body.innerHTML
    editor.schema.enforceMedia(body)
    expect(body.innerHTML).toBe(html)
  })

  it("requires controls and canonical media in schema validation", () => {
    const body = document.createElement("body")
    body.innerHTML = '<audio></audio><video></video><embed><object></object><img>'
    for(const child of Array.from(body.children)) expect(editor.schema.isNodeValid(child)).toBe(false)
    editor.schema.enforceMedia(body)
    expect(body.querySelectorAll("audio[controls], video[controls]")).toHaveLength(2)
    expect(body.querySelectorAll("iframe")).toHaveLength(2)
    expect(body.querySelector("picture > img")).not.toBeNull()
    for(const child of Array.from(body.children)) expect(editor.schema.isNodeValid(child)).toBe(true)
  })

  it("converts transferred websites before sanitization and wraps transferred images", () => {
    const {fragment} = editor.parseHTMLFragment('<p><img src="image.png" alt="Image"></p><object data="https://example.com/page" width="640"></object><embed src="https://example.com/other"><video></video>', true)
    expect(fragment.querySelector("picture > img")).toHaveAttribute("alt", "Image")
    const frames = fragment.querySelectorAll("iframe")
    expect(frames).toHaveLength(2)
    expect(frames[0]).toHaveAttribute("src", "https://example.com/page")
    expect(frames[0]).toHaveAttribute("width", "640")
    expect(frames[0]).toHaveAttribute("sandbox", "allow-scripts")
    expect(fragment.querySelector("embed, object")).toBeNull()
    expect(fragment.querySelector("video")).toHaveAttribute("controls")
  })
})
