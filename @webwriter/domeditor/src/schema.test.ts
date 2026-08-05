// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, beforeAll } from "vitest"
import '@testing-library/jest-dom/vitest'

import { DOMEditor } from "./domeditor"
import { Schema } from "./schema"
import { $ } from "./utility"

var editor = new DOMEditor()

function expectBodyToBe(html: string) {
  return expect(editor.toHTML(true)).toEqual(html)
}

beforeEach(() => {
  document.body.innerHTML = ""
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
    document.body.insertAdjacentHTML("afterbegin", 
      `<ul><p>hello</p></ul>`
    )
    editor.schema.fixInvalidContent(document.querySelector("ul")!)
    expectBodyToBe(`<ul><li><p>hello</p></li></ul>`)
  })
  it("can fix an invalid text node by wrapping", () => {
    document.body.insertAdjacentHTML("afterbegin", 
      `<ul>hello</ul>`
    )
    editor.schema.fixInvalidContent(document.querySelector("ul")!)
    expectBodyToBe(`<ul><li>hello</li></ul>`)
  })
  it("can fix invalid mixed inline content by wrapping", () => {
    document.body.insertAdjacentHTML("afterbegin", 
      `<ul>hello <b>world</b></ul>`
    )
    editor.schema.fixInvalidContent(document.querySelector("ul")!)
    expectBodyToBe(`<ul><li>hello <b>world</b></li></ul>`)
  })
  // it("can fix an invalid tree by filling", () => {})
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
  })

  describe("transparent rules", () => {
    // Note: validating an actual child of a transparent element (e.g. a node
    // inside <a> or <slot>) currently loops forever in isNodeValid, since the
    // parent lookup never advances past the transparent rule. These tests pass
    // the transparent rule explicitly for nodes whose parent has a concrete rule.
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
      expect(schema.get(rect)).toBe(schema.get("svg|rect"))
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
    it("contains types with an empty selector and placeholder or empty style", () => {
      expect(schema.placeholderKeys).toContain("h1")
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
      expect(schema.findValidContentTypes("ul")).toEqual(["li", "script", "template"])
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
    it("returns the types insertable at the selection", () => {
      document.body.innerHTML = "<p>x</p>"
      $.move(document.body, 1)
      const types = schema.findValidTypesToInsert()
      expect(types).toContain("p")
      expect(types).toContain("div")
    })
  })
})
