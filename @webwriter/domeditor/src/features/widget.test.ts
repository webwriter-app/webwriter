// @vitest-environment happy-dom
import {afterAll, afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import * as Y from "yjs"
import {DOMEditor} from "../domeditor"
import {sharedDOMBody} from "../domdoc"
import {Schema} from "../schema"
import {$, isWidgetShadowInteraction} from "../utility"
import {isDataBlockType, stripActiveContent} from "../active-content"
import {isWidgetOptionsState} from "../widget-options"
import {effectiveDistribution} from "../distribution-dom"
import type {ActionDeclaration, OptionDeclaration} from "../../../lit/index"

class OptionsWidget extends HTMLElement {
  static options = {
    count: {type: Number, label: {_: "Count", de: "Anzahl"}, min: 0},
    shuffled: {type: Boolean},
    data: {type: Object, attribute: "widget-data"},
    mode: {type: "select", options: [{value: "a", label: {_: "A"}}, {value: "b"}]},
    handler: {type: String, attribute: "onclick"},
    internal: {type: String, attribute: false},
  }
  static actions = {reset: {label: {_: "Reset"}}, missing: {}}
  internal = ""
  get count() { return Number(this.getAttribute("count") ?? 0) }
  get shuffled() { return this.hasAttribute("shuffled") }
  get data() { return JSON.parse(this.getAttribute("widget-data") ?? "null") }
  get mode() { return this.getAttribute("mode") }
  reset() {
    this.setAttribute("count", "0")
    this.removeAttribute("shuffled")
  }
}
customElements.define("demo-options", OptionsWidget)

const editor = new DOMEditor()

const installWidgets = () => {
  editor.schema = new Schema()
  editor.schema.extendWidgets([
    {tagName: "demo-widget"},
    {tagName: "demo-note", editingConfig: {content: "p+", marks: "b i", propagateEvents: ["keydown"]}},
    {tagName: "demo-plain", editingConfig: {content: "p+", marks: ""}},
    {tagName: "demo-options"},
  ])
  editor.features.widget.refresh()
}

const sharedHTML = () => {
  editor.doc.syncFromDOM()
  return sharedDOMBody(editor.doc.doc).toString()
}

beforeEach(() => {
  document.body.innerHTML = ""
  installWidgets()
})

afterAll(() => editor.destroy())

describe("WidgetFeature", () => {
  it("sets options on all currently selected widgets of one type as one undo step", () => {
    document.body.innerHTML = '<demo-options count="1"></demo-options><demo-options count="2"></demo-options><demo-options count="3"></demo-options><p>Other</p>'
    editor.features.widget.refresh()
    editor.setDocumentLayout("canvas", editor.getDocumentLayoutState().mode)
    expect(editor.getDocumentLayoutState().mode).toBe("canvas")
    const widgets = Array.from(document.querySelectorAll("demo-options"))
    $.selectElements([widgets[0], widgets[1], document.querySelector("p")!])
    const selectionType = {localName: "demo-options", namespaceURI: "http://www.w3.org/1999/xhtml"}
    const groups = editor.features.manipulation.getSelectedElementTypes()
    expect(groups.filter(group => group.element.localName === "demo-options").map(group => [group.count, group.widget!.options.find(option => option.name === "count")!.value])).toEqual([[1, 1], [1, 2]])
    editor.features.widget.actions.setSelectedWidgetOption({type: "setSelectedWidgetOption", selectionType, name: "count", value: 7})
    expect(widgets.map(widget => widget.getAttribute("count"))).toEqual(["7", "7", "3"])
    editor.doc.undo()
    expect(Array.from(document.querySelectorAll("demo-options"), widget => widget.getAttribute("count"))).toEqual(["1", "2", "3"])
    editor.doc.redo()
    expect(Array.from(document.querySelectorAll("demo-options"), widget => widget.getAttribute("count"))).toEqual(["7", "7", "3"])
    $.selectElement(document.querySelector("p")!, false)
    expect(editor.features.widget.actions.setSelectedWidgetOption({type: "setSelectedWidgetOption", selectionType, name: "count", value: 8})).toBe(false)
    expect(Array.from(document.querySelectorAll("demo-options"), widget => widget.getAttribute("count"))).toEqual(["7", "7", "3"])
  })

  it("projects separate widget drawers with package icons and scopes all edits to one live instance", async () => {
    document.body.innerHTML = '<demo-options id="first" count="1"></demo-options><demo-options id="second" count="2"></demo-options>'
    editor.features.widget.refresh()
    editor.setDocumentLayout("canvas", editor.getDocumentLayoutState().mode)
    const [first, second] = Array.from(document.querySelectorAll("demo-options"))
    $.selectElements([first, second])
    const packages = globalThis.DOMEDITOR_PACKAGE_ITEMS
    globalThis.DOMEDITOR_PACKAGE_ITEMS = [{section: "Packages", name: "Quiz", packageName: "@example/quiz", kind: "widget", tag: "demo-options", iconUrl: "https://example.com/quiz.svg"}]
    try {
      const groups = editor.features.manipulation.getSelectedElementTypes()
      expect(groups).toHaveLength(2)
      expect(groups.map(group => group.element)).toMatchObject([
        {name: "Quiz", icon: "Packages", iconUrl: "https://example.com/quiz.svg", attributes: {id: "first"}},
        {name: "Quiz", icon: "Packages", iconUrl: "https://example.com/quiz.svg", attributes: {id: "second"}},
      ])
      expect(groups.map(group => group.count)).toEqual([1, 1])
      const selectionType = {localName: "demo-options", namespaceURI: first.namespaceURI, id: "second"}
      // Identity continues to address the same selected widget after a DOM reorder.
      document.body.insertBefore(second, first)
      editor.features.widget.actions.setSelectedWidgetOption({type: "setSelectedWidgetOption", selectionType, name: "count", value: 7})
      editor.features.manipulation.actions.setSelectedElementAttribute({type: "setSelectedElementAttribute", selectionType, name: "lang", value: "de"})
      editor.features.manipulation.actions.setSelectedElementStyles({type: "setSelectedElementStyles", selectionType, styles: {color: "red"}})
      expect(first.getAttribute("count")).toBe("1")
      expect(first.hasAttribute("lang")).toBe(false)
      expect((first as HTMLElement).style.color).toBe("")
      expect(second.getAttribute("count")).toBe("7")
      expect(second.getAttribute("lang")).toBe("de")
      expect((second as HTMLElement).style.color).toBe("red")
      await editor.features.widget.actions.runSelectedWidgetAction({type: "runSelectedWidgetAction", selectionType, name: "reset"})
      expect(second.getAttribute("count")).toBe("0")
      expect(first.getAttribute("count")).toBe("1")
      second.remove()
      expect(editor.features.widget.actions.setSelectedWidgetOption({type: "setSelectedWidgetOption", selectionType, name: "count", value: 8})).toBe(false)
      expect(editor.features.manipulation.actions.setSelectedElementAttribute({type: "setSelectedElementAttribute", selectionType, name: "lang", value: "en"})).toBe(false)
    }
    finally { globalThis.DOMEDITOR_PACKAGE_ITEMS = packages }
  })

  it("does not partially edit a widget type when a current instance no longer declares the option", () => {
    document.body.innerHTML = '<demo-options count="1"></demo-options><demo-options count="2"></demo-options>'
    editor.features.widget.refresh()
    editor.setDocumentLayout("canvas", editor.getDocumentLayoutState().mode)
    expect(editor.getDocumentLayoutState().mode).toBe("canvas")
    const widgets = Array.from(document.querySelectorAll("demo-options"))
    $.selectElements(widgets)
    Object.defineProperty(widgets[1], "options", {value: {mode: {type: "select"}}})
    expect(editor.features.widget.actions.setSelectedWidgetOption({type: "setSelectedWidgetOption",
      selectionType: {localName: "demo-options", namespaceURI: "http://www.w3.org/1999/xhtml"}, name: "count", value: 7,
    })).toBe(false)
    expect(widgets.map(widget => widget.getAttribute("count"))).toEqual(["1", "2"])
  })

  it("assigns distinct UUIDv4 IDs to connected widgets, including nested and inline widgets", async () => {
    editor.schema.extendWidgets([{tagName: "demo-inline", editingConfig: {inline: true}}])
    document.body.innerHTML = '<section><!--keep--><demo-note><p><demo-inline id=""></demo-inline></p></demo-note><unknown-element></unknown-element></section>'
    editor.features.widget.refresh()
    const inserted = document.createElement("demo-widget")
    expect(inserted.id).toBe("")
    document.querySelector("section")!.append(inserted)
    await new Promise(resolve => setTimeout(resolve))

    const widgets = [...document.querySelectorAll("demo-note, demo-inline, demo-widget")]
    const ids = widgets.map(widget => widget.id)
    ids.forEach(id => expect(id).toMatch(/^ww[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/))
    expect(new Set(ids).size).toBe(3)
    expect(document.querySelector("unknown-element")!.hasAttribute("id")).toBe(false)
    expect(document.querySelector("section")!.hasAttribute("id")).toBe(false)
    ids.forEach(id => {
      expect(editor.toHTML(true)).toContain(`id="${id}"`)
      expect(sharedHTML()).toContain(`id="${id}"`)
    })
  })

  it("preserves IDs through refresh, reconnection, disabling, and undo/redo", async () => {
    document.body.innerHTML = '<demo-widget></demo-widget><demo-options id="authored-id"></demo-options>'
    editor.features.widget.refresh()
    const widget = document.querySelector("demo-widget")!
    const id = widget.id
    widget.remove()
    await new Promise(resolve => setTimeout(resolve))
    document.body.append(widget)
    await new Promise(resolve => setTimeout(resolve))
    editor.features.widget.refresh()
    editor.features.widget.disable()
    expect(widget.id).toBe(id)
    editor.features.widget.enable()
    expect(widget.id).toBe(id)
    expect(document.querySelector("demo-options")!.id).toBe("authored-id")

    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    widget.remove()
    editor.doc.syncFromDOM()
    editor.doc.undo()
    await new Promise(resolve => setTimeout(resolve))
    expect(document.querySelector("demo-widget")!.id).toBe(id)
    editor.doc.redo()
    expect(document.querySelector("demo-widget")).toBeNull()
  })

  it("ignores widgets removed before the connection observer runs and widgets in shadow DOM", async () => {
    const removed = document.createElement("demo-widget")
    document.body.append(removed)
    removed.remove()
    const host = document.createElement("demo-widget")
    const internal = host.attachShadow({mode: "open"}).appendChild(document.createElement("demo-widget"))
    document.body.append(host)
    await new Promise(resolve => setTimeout(resolve))
    expect(removed.id).toBe("")
    expect(internal.id).toBe("")
    expect(host.id).toMatch(/^ww[0-9a-f]/)
  })

  it("preserves widget IDs received through collaboration", async () => {
    editor.doc.syncFromDOM()
    const remote = new Y.Doc()
    try {
      Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc))
      const widget = new Y.XmlElement("demo-widget")
      const id = `ww${crypto.randomUUID()}`
      widget.setAttribute("id", id)
      sharedDOMBody(remote).push([widget])
      Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(remote), "remote")
      await new Promise(resolve => setTimeout(resolve))
      expect(document.querySelector("demo-widget")!.id).toBe(id)
      expect(sharedHTML()).toContain(`id="${id}"`)
    }
    finally {
      remote.destroy()
    }
  })

  it("marks installed widgets as editable without authoring the attribute", async () => {
    document.body.innerHTML = '<demo-widget answer="1"></demo-widget><unknown-element></unknown-element><p>Text</p>'
    editor.features.widget.refresh()
    const widget = document.querySelector("demo-widget")!
    expect(widget.getAttribute("contenteditable")).toBe("")
    expect(document.querySelector("unknown-element")!.hasAttribute("contenteditable")).toBe(false)

    const inserted = document.createElement("demo-widget")
    document.body.append(inserted)
    await new Promise(resolve => setTimeout(resolve))
    expect(inserted.getAttribute("contenteditable")).toBe("")

    expect(editor.toHTML(true)).toBe(`<demo-widget answer="1" id="${widget.id}"></demo-widget><unknown-element></unknown-element><p>Text</p><demo-widget id="${inserted.id}"></demo-widget>`)
    expect(sharedHTML()).not.toContain("contenteditable")
  })

  it("keeps an authored contenteditable value", () => {
    document.body.innerHTML = '<demo-widget contenteditable="false"></demo-widget>'
    editor.features.widget.refresh()
    expect(document.querySelector("demo-widget")!.getAttribute("contenteditable")).toBe("false")
    expect(editor.toHTML(true)).toBe(`<demo-widget contenteditable="false" id="${document.querySelector("demo-widget")!.id}"></demo-widget>`)
  })

  it("removes the attribute when the editor is disabled", () => {
    document.body.innerHTML = "<demo-widget></demo-widget>"
    editor.features.widget.refresh()
    editor.features.widget.disable()
    expect(document.querySelector("demo-widget")!.hasAttribute("contenteditable")).toBe(false)
    editor.features.widget.enable()
    expect(document.querySelector("demo-widget")!.getAttribute("contenteditable")).toBe("")
  })

})

describe("widget editing config", () => {
  it("lets listed shadow events reach editor features", () => {
    document.body.innerHTML = "<demo-note><p>Text</p></demo-note><demo-widget></demo-widget>"
    const events: Record<string, Event> = {}
    for(const tag of ["demo-note", "demo-widget"]) {
      const host = document.querySelector(tag)!
      const button = host.attachShadow({mode: "open"}).appendChild(document.createElement("button"))
      for(const type of ["keydown", "keyup"]) {
        const listener = (event: Event) => { events[`${tag}:${type}`] = event }
        document.addEventListener(type, listener, {once: true})
        button.dispatchEvent(new KeyboardEvent(type, {bubbles: true, composed: true}))
      }
    }
    expect(isWidgetShadowInteraction(events["demo-note:keydown"], editor.schema)).toBe(false)
    expect(isWidgetShadowInteraction(events["demo-note:keyup"], editor.schema)).toBe(true)
    expect(isWidgetShadowInteraction(events["demo-widget:keydown"], editor.schema)).toBe(true)
  })

  it("restricts marks inside widget content", () => {
    document.body.innerHTML = "<demo-note><p>Text</p></demo-note><p>Outside</p>"
    const text = document.querySelector("demo-note p")!.firstChild as Text
    $.selectRange(text, 0, text, 4)
    const mark = editor.features.mark
    expect(mark.getState()).toMatchObject({canMark: true, allowedMarks: ["b", "i"]})
    expect(mark.addMark("u")).toBe(false)
    expect(mark.setStyleMark("color", "red")).toBe(false)
    expect(mark.toggleMark("b")).toBe(true)
    expect(document.querySelector("demo-note p")!.innerHTML).toBe("<b>Text</b>")

    const outside = document.querySelector("body > p")!.firstChild as Text
    $.selectRange(outside, 0, outside, 3)
    expect(mark.getState().allowedMarks).toBeUndefined()
    expect(mark.addMark("u")).toBe(true)
  })

  it("disables marks in widgets that allow none", () => {
    document.body.innerHTML = "<demo-plain><p>Text</p></demo-plain>"
    const text = document.querySelector("demo-plain p")!.firstChild as Text
    $.selectRange(text, 0, text, 4)
    expect(editor.features.mark.getState()).toMatchObject({canMark: false, allowedMarks: []})
    expect(editor.features.mark.addMark("b")).toBe(false)
  })
})

describe("widget options", () => {
  it("reports selected widgets even without optional dynamic declarations", () => {
    document.body.innerHTML = "<demo-plain><p>Nested content</p></demo-plain>"
    const widget = document.querySelector("demo-plain")!
    expect(editor.features.widget.getOptionsState([document.body, widget, widget.firstElementChild!])).toMatchObject({
      path: [0], localName: "demo-plain", options: [], actions: [],
    })
    widget.replaceWith(document.createElement("demo-plain"))
    expect(editor.features.widget.getOptionsState([document.body, widget])).toBeNull()
  })

  it("describes the options and actions of the selected widget", () => {
    document.documentElement.lang = "de"
    document.body.innerHTML = '<p>Before</p><demo-options count="3" shuffled widget-data="[1,2]" mode="b"></demo-options>'
    const widget = document.querySelector("demo-options")!
    const state = editor.features.widget.getOptionsState([document.body, widget])!
    expect(state.path).toEqual([1])
    expect(state.options).toEqual([
      {name: "count", type: "number", label: "Anzahl", attribute: "count", value: 3, min: 0},
      {name: "shuffled", type: "boolean", label: "Shuffled", attribute: "shuffled", value: true},
      {name: "data", type: "object", label: "Data", attribute: "widget-data", value: [1, 2]},
      {name: "mode", type: "select", label: "Mode", attribute: "mode", value: "b", choices: [{value: "a", label: "A"}, {value: "b", label: "b"}]},
      {name: "handler", type: "string", label: "Handler", attribute: "onclick", value: null},
      {name: "internal", type: "string", label: "Internal", attribute: null, value: ""},
    ])
    expect(state.actions).toEqual([{name: "reset", label: "Reset"}])
    expect(editor.features.widget.getOptionsState([document.body, document.querySelector("p")!])).toBeNull()
    document.documentElement.removeAttribute("lang")
  })

  it("writes options to their reflected attributes", () => {
    document.body.innerHTML = '<demo-options id="options-widget" count="3" shuffled></demo-options>'
    const widget = document.querySelector("demo-options") as OptionsWidget
    const set = editor.getActionHandler("setWidgetOption")
    set({type: "setWidgetOption", path: [0], localName: "demo-options", name: "count", value: 5})
    set({type: "setWidgetOption", path: [0], localName: "demo-options", name: "shuffled", value: false})
    set({type: "setWidgetOption", path: [0], localName: "demo-options", name: "data", value: {a: [1]}})
    set({type: "setWidgetOption", path: [0], localName: "demo-options", name: "internal", value: "kept"})
    expect(editor.toHTML(true)).toBe('<demo-options id="options-widget" count="5" widget-data="{&quot;a&quot;:[1]}"></demo-options>')
    expect(widget.internal).toBe("kept")
    expect(() => set({type: "setWidgetOption", path: [0], localName: "demo-options", name: "handler", value: "evil()"})).toThrow("cannot be set")
    expect(() => set({type: "setWidgetOption", path: [0], localName: "demo-options", name: "unknown", value: 1})).toThrow("no option")
    expect(() => set({type: "setWidgetOption", path: [0], localName: "other-widget", name: "count", value: 1})).toThrow("changed")
  })

  it("accepts legacy dynamicOptions and reads their current reflected values", () => {
    document.body.innerHTML = '<demo-options detailed-feedback grading-method="partial" count="3"></demo-options>'
    const widget = document.querySelector("demo-options")!
    Object.defineProperty(widget, "dynamicOptions", {get: () => ({
      "detailed-feedback": {type: "boolean", label: {_: "Show detailed feedback"}},
      "grading-method": {type: "select", options: [{value: "pass-fail"}, {value: "partial"}]},
      count: {type: String, label: {_: "Legacy count"}},
    })})
    const options = () => editor.features.widget.getOptionsState([widget])!.options
    expect(options().find(option => option.name === "detailed-feedback")).toMatchObject({type: "boolean", value: true})
    expect(options().find(option => option.name === "grading-method")).toMatchObject({value: "partial"})
    expect(options().find(option => option.name === "count")).toMatchObject({type: "number", value: 3})
    editor.features.widget.setOption(widget, "detailed-feedback", false)
    editor.features.widget.setOption(widget, "grading-method", "pass-fail")
    expect(widget.hasAttribute("detailed-feedback")).toBe(false)
    expect(options().find(option => option.name === "detailed-feedback")!.value).toBe(false)
    expect(options().find(option => option.name === "grading-method")!.value).toBe("pass-fail")
  })

  it("runs an action as one undo step", async () => {
    document.body.innerHTML = '<demo-options count="3" shuffled id="existing-id"></demo-options>'
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const run = editor.getActionHandler("runWidgetAction")
    await expect(run({type: "runWidgetAction", path: [0], localName: "demo-options", name: "reset"})).resolves.toBe(true)
    expect(editor.toHTML(true)).toBe('<demo-options count="0" id="existing-id"></demo-options>')
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe('<demo-options count="3" id="existing-id" shuffled=""></demo-options>')
    await expect(run({type: "runWidgetAction", path: [0], localName: "demo-options", name: "missing"})).rejects.toThrow("not a method")
  })
})

describe("widget inspection", () => {
  it("reports undefined widgets and properties that are not saved", () => {
    class LitLike extends HTMLElement {
      static elementProperties = new Map<string, object>([
        ["value", {reflect: true}],
        ["draft", {}],
        ["internal", {attribute: false}],
        ["hover", {state: true}],
      ])
    }
    customElements.define("demo-lit-like", LitLike)
    const inspect = editor.getActionHandler("inspectWidgets")
    expect(inspect({type: "inspectWidgets", tagNames: ["demo-lit-like", "demo-missing"]})).toEqual([
      {tagName: "demo-lit-like", defined: true, unreflected: ["draft"]},
      {tagName: "demo-missing", defined: false, unreflected: []},
    ])
  })
})

describe("widget data containers", () => {
  it("declares scoped data support and exports defaults unless a participant snapshot is requested", async () => {
    editor.schema.extendWidgets([{tagName: "demo-widget", editingConfig: {sharedData: true}}])
    document.body.innerHTML = '<demo-widget id="data-export"><script type="application/json" slot="data">{"answer":null}</script></demo-widget>'
    editor.features.widget.refresh()
    const block = document.querySelector("script")!
    block.textContent = '{"answer":"participant"}'
    editor.doc.syncFromDOM()
    await new Promise(resolve => setTimeout(resolve))
    expect(editor.schema.get(document.querySelector("demo-widget")!)?.sharedData).toBe(true)
    expect(editor.toHTML(true)).toContain('{"answer":null}')
    expect(editor.toHTML(true)).not.toContain("participant")
    expect(editor.toHTML(true, false, "current")).toContain("participant")
    const fragment = document.createDocumentFragment()
    fragment.append(document.querySelector("demo-widget")!.cloneNode(true))
    expect(editor.serializeClipboardFragment(fragment).html).not.toContain("participant")
  })

  it("keeps inert data blocks of widgets and removes executable scripts", () => {
    expect(["application/json", "text/plain", "Application/LD+JSON; charset=utf-8"].every(isDataBlockType)).toBe(true)
    expect(["", "module", "importmap", "text/javascript", "TEXT/JavaScript; charset=utf-8", "text/jscript"].some(isDataBlockType)).toBe(false)
    const template = document.createElement("template")
    template.innerHTML = [
      '<demo-note><script type="application/json">{"a":1}</script><p>Text</p></demo-note>',
      '<demo-note><script>evil()</script><script type="text/javascript;charset=utf-8">evil()</script><script type="application/json" src="x.json"></script></demo-note>',
      '<p><script type="application/json">{}</script></p>',
    ].join("")
    stripActiveContent(template.content)
    expect(template.innerHTML).toBe('<demo-note><script type="application/json">{"a":1}</script><p>Text</p></demo-note><demo-note></demo-note><p></p>')
  })

  it("accepts data containers under any content model and keeps them when pasting", () => {
    document.body.innerHTML = '<demo-note><script type="application/json">{"a":1}</script><p>Text</p></demo-note>'
    const widget = document.querySelector("demo-note")!
    expect(editor.schema.isContentValid(widget)).toBe(true)
    const {fragment} = editor.parseHTMLFragment('<demo-widget><script type="application/json">{"b":2}</script></demo-widget>', true)
    expect(fragment.firstElementChild?.outerHTML).toBe('<demo-widget><script type="application/json">{"b":2}</script></demo-widget>')
  })
})

describe("widget contract edge cases", () => {
  it("syncs an authored contenteditable value written onto a marked widget", () => {
    document.body.innerHTML = "<demo-widget></demo-widget>"
    editor.features.widget.refresh()
    document.querySelector("demo-widget")!.setAttribute("contenteditable", "false")
    expect(sharedHTML()).toContain('contenteditable="false"')
    expect(editor.toHTML(true)).toBe(`<demo-widget id="${document.querySelector("demo-widget")!.id}" contenteditable="false"></demo-widget>`)
  })

  it("keeps separate undo steps after overlapping groups end out of order", async () => {
    document.body.innerHTML = '<p id="a">one</p><p id="b">one</p>'
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const outer = editor.doc.beginUndoGroup()
    const inner = editor.doc.beginUndoGroup()
    outer()
    inner()
    document.querySelector("#a")!.textContent = "two"
    editor.doc.syncFromDOM()
    await new Promise(resolve => setTimeout(resolve, 700))
    document.querySelector("#b")!.textContent = "two"
    editor.doc.syncFromDOM()
    editor.doc.undo()
    expect(document.querySelector("#a")!.textContent).toBe("two")
    expect(document.querySelector("#b")!.textContent).toBe("one")
  })

  it("does not report base-class global attributes as unsaved", () => {
    class LangWidget extends HTMLElement {
      static elementProperties = new Map<string, object>([["lang", {}], ["draft", {}]])
    }
    customElements.define("demo-lang-widget", LangWidget)
    expect(editor.features.widget.inspect("demo-lang-widget").unreflected).toEqual(["draft"])
  })

  it("rejects malformed option state from the frame", () => {
    const state = {path: [0], localName: "demo-options", actions: [], options: [
      {name: "color", type: "color", label: "Color", attribute: "color", value: null, swatches: "red"},
    ]}
    expect(isWidgetOptionsState(state)).toBe(false)
    state.options[0].swatches = ["red"] as never
    expect(isWidgetOptionsState(state)).toBe(true)
  })
})

describe("widget sharing controls", () => {
  afterEach(() => document.head.replaceChildren())

  it.each(["application/json", "application/xml"])("reports only the direct scoped %s data block", type => {
    editor.schema.extendWidgets([{tagName: "demo-widget", editingConfig: {sharedData: true}}])
    const value = type === "application/json" ? '{"answers":{}}' : '<answers />'
    document.body.innerHTML = `<demo-widget><div><script slot="data" type="${type}">nested</script></div><script slot="data" type="${type}">${value}</script></demo-widget>`
    const widget = document.querySelector("demo-widget")!
    const state = editor.features.widget.getOptionsState([document.body, widget])!
    expect(state.data).toEqual({type, value})
    expect(isWidgetOptionsState(state)).toBe(true)
    expect(isWidgetOptionsState({...state, data: {type: "text/javascript", value}})).toBe(false)
    widget.querySelector(":scope > script")!.remove()
    expect(editor.features.widget.getOptionsState([document.body, widget])?.data).toBeUndefined()
  })

  it("offers sharing without widget options, retains rules while off and removes grouping independently", async () => {
    const {defaultGroupingRules} = await import("../widget-grouping.js")
    const {readWidgetGrouping} = await import("../widget-grouping-dom")
    editor.schema.extendWidgets([{tagName: "demo-widget", editingConfig: {sharedData: true}}])
    document.body.innerHTML = '<p>Before</p><demo-widget id="shared-widget"><script slot="data" type="application/json">{}</script></demo-widget>'
    editor.features.widget.refresh()
    const widget = document.querySelector("demo-widget")!
    const reference = {path: [1], localName: "demo-widget", widgetId: widget.id}
    expect(editor.features.widget.getOptionsState([document.body, widget])?.sharing?.mode).toBe("individual")
    const share = editor.getActionHandler("setWidgetSharing"), group = editor.getActionHandler("setWidgetGrouping")
    share({type: "setWidgetSharing", ...reference, enabled: true})
    expect(widget.hasAttribute("shared")).toBe(false)
    expect(effectiveDistribution(widget)?.config.scope).toBe("all")
    const rules = defaultGroupingRules("stable")
    group({type: "setWidgetGrouping", ...reference, grouping: rules})
    expect(widget.hasAttribute("shared")).toBe(false)
    expect(effectiveDistribution(widget)?.config.scope).toBe("group")
    expect(widget.lastChild?.nodeType).toBe(7)
    expect(readWidgetGrouping(widget)).toEqual(rules)
    const state = editor.features.widget.getOptionsState([document.body, widget])!
    expect(isWidgetOptionsState(state)).toBe(true)
    expect(isWidgetOptionsState({...state, sharing: {...state.sharing, grouping: {version: 99}}})).toBe(false)
    share({type: "setWidgetSharing", ...reference, enabled: false})
    expect(widget.hasAttribute("shared")).toBe(false)
    expect(effectiveDistribution(widget)?.config.scope).toBe("individual")
    expect(readWidgetGrouping(widget)).toEqual(rules)
    share({type: "setWidgetSharing", ...reference, enabled: true})
    expect(widget.hasAttribute("shared")).toBe(false)
    expect(effectiveDistribution(widget)?.config.scope).toBe("group")
    group({type: "setWidgetGrouping", ...reference, grouping: null})
    expect(widget.hasAttribute("shared")).toBe(false)
    expect(effectiveDistribution(widget)?.config.scope).toBe("all")
    expect(readWidgetGrouping(widget)).toBeNull()
  })

  it("undoes and redoes grouping rules and sharing mode together", async () => {
    const {defaultGroupingRules} = await import("../widget-grouping.js")
    const {readWidgetGrouping} = await import("../widget-grouping-dom")
    editor.schema.extendWidgets([{tagName: "demo-widget", editingConfig: {sharedData: true}}])
    document.body.innerHTML = '<demo-widget id="undo-sharing" shared></demo-widget>'
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const widget = document.querySelector("demo-widget")!
    editor.getActionHandler("setWidgetGrouping")({type: "setWidgetGrouping", path: [0], localName: widget.localName,
      widgetId: widget.id, grouping: defaultGroupingRules("undo")})
    editor.doc.undo()
    expect(widget.getAttribute("shared")).toBe("")
    expect(effectiveDistribution(widget)).toBeNull()
    expect(readWidgetGrouping(widget)).toBeNull()
    editor.doc.redo()
    expect(widget.hasAttribute("shared")).toBe(false)
    expect(effectiveDistribution(widget)?.config.scope).toBe("group")
    expect(readWidgetGrouping(widget)?.seed).toBe("undo")
  })

  it("rejects a replaced widget while a grouping dialog is open", () => {
    editor.schema.extendWidgets([{tagName: "demo-widget", editingConfig: {sharedData: true}}])
    document.body.innerHTML = '<demo-widget id="replacement"></demo-widget>'
    const action = editor.getActionHandler("setWidgetSharing")
    expect(() => action({type: "setWidgetSharing", path: [0], localName: "demo-widget", widgetId: "original", enabled: true})).toThrow("changed")
    expect(document.querySelector("demo-widget")?.hasAttribute("shared")).toBe(false)
  })

  it("preserves a native grouping instruction in document and clipboard exports and import", async () => {
    const {defaultGroupingRules} = await import("../widget-grouping.js")
    const {writeWidgetGrouping, readWidgetGrouping} = await import("../widget-grouping-dom")
    editor.schema.extendWidgets([{tagName: "demo-widget", editingConfig: {sharedData: true}}])
    document.body.innerHTML = '<demo-widget id="portable" shared="group"><script type="application/json" slot="data">{}</script></demo-widget>'
    const widget = document.querySelector("demo-widget")!
    const rules = defaultGroupingRules("export")
    writeWidgetGrouping(widget, rules)
    const html = editor.toHTML(true)
    expect(html).toContain("<?ww-grouping ")
    expect(editor.toHTML(false, false)).toContain("<html")
    const imported = editor.parseHTMLFragment(html).fragment
    expect(readWidgetGrouping(imported.querySelector("demo-widget")!)).toEqual(rules)
    expect(imported.querySelector("demo-widget")?.lastChild?.nodeType).toBe(7)
    const clipboard = editor.serializeClipboardFragment(imported)
    expect(clipboard.html).toContain("<?ww-grouping ")
    expect(clipboard.html).not.toContain("◆")
    expect(editor.schema.isContentValid(widget)).toBe(true)
  })
})

describe("dynamic widget inspector declarations", () => {
  it("supports localized groups and lets empty or failing instance declarations suppress static maps", () => {
    document.body.innerHTML = '<demo-options count="3"></demo-options>'
    const widget = document.querySelector("demo-options")!
    Object.defineProperty(widget, "optionGroups", {value: {main: {label: {_: "General"}, collapsible: true}}})
    expect(editor.features.widget.getOptionsState([widget])!.groups).toEqual([{name: "main", label: "General", collapsible: true}])
    Object.defineProperty(widget, "options", {get: () => ({})})
    Object.defineProperty(widget, "actions", {get: () => { throw Error("Not ready") }})
    expect(editor.features.widget.getOptionsState([widget])).toMatchObject({options: [], actions: []})
    expect(() => editor.features.widget.setOption(widget, "count", 7)).toThrow("no option")
  })

  it.each(["hidden", "disabled", "readOnly"])("rechecks %s options before applying changes, including resets", availability => {
    document.body.innerHTML = '<demo-options count="3"></demo-options>'
    const widget = document.querySelector("demo-options")!
    let locked = false
    Object.defineProperty(widget, "options", {get: () => ({count: {type: Number, [availability]: locked}})})
    expect(editor.features.widget.getOptionsState([widget])!.options[0].value).toBe(3)
    locked = true
    expect(editor.features.widget.setOption(widget, "count", 7)).toBe(false)
    expect(editor.features.widget.setOption(widget, "count", null)).toBe(false)
    expect(widget.getAttribute("count")).toBe("3")
    locked = false
    expect(editor.features.widget.setOption(widget, "count", 7)).toBe(true)
    widget.remove()
    expect(editor.features.widget.setOption(widget, "count", 8)).toBe(false)
  })

  it("validates live numeric bounds and choices without changing serialization", () => {
    document.body.innerHTML = '<demo-options count="3" mode="a"><!--keep--><p>Keep</p></demo-options>'
    const widget = document.querySelector("demo-options")!
    Object.defineProperty(widget, "options", {value: {
      count: {type: Number, control: "range", min: 1, max: 10, steps: [1, 3, 10], unit: "px"},
      mode: {type: "select", options: [{value: "a"}]},
    }})
    expect(editor.features.widget.setOption(widget, "count", 4)).toBe(false)
    expect(editor.features.widget.setOption(widget, "count", 11)).toBe(false)
    expect(editor.features.widget.setOption(widget, "mode", "b")).toBe(false)
    expect(editor.features.widget.setOption(widget, "count", 10)).toBe(true)
    const html = editor.toHTML(true)
    expect(html).toContain('count="10"')
    expect(html).toContain('<!--keep--><p>Keep</p>')
    expect(html).not.toMatch(/unit=|control=|steps=|◆/)
    expect(sharedHTML()).not.toMatch(/unit=|control=|steps=|◆/)
  })

  it("refreshes host notifications once and ignores incidental shadow events and teardown", async () => {
    document.body.innerHTML = '<demo-options></demo-options>'
    const widget = document.querySelector("demo-options")!
    const inner = document.createElement("input")
    widget.attachShadow({mode: "open"}).append(inner)
    await new Promise(resolve => setTimeout(resolve, 20))
    const post = vi.spyOn(editor, "postSelectionPath")
    inner.dispatchEvent(new Event("optionschange", {bubbles: true, composed: true}))
    document.body.dispatchEvent(new Event("optionschange", {bubbles: true}))
    await Promise.resolve()
    expect(post).not.toHaveBeenCalled()
    widget.dispatchEvent(new Event("optionschange", {bubbles: true}))
    widget.dispatchEvent(new Event("optionschange", {bubbles: true}))
    await Promise.resolve()
    expect(post).toHaveBeenCalledTimes(1)
    editor.features.widget.disable()
    await new Promise(resolve => setTimeout(resolve, 20))
    post.mockClear()
    widget.dispatchEvent(new Event("optionschange", {bubbles: true}))
    await Promise.resolve()
    expect(post).not.toHaveBeenCalled()
    editor.features.widget.enable()
    post.mockRestore()
  })

  it("rechecks action availability and confirmation, and keeps confirmed changes undoable", async () => {
    document.body.innerHTML = '<demo-options count="3"></demo-options>'
    const widget = document.querySelector("demo-options")!
    let disabled = false
    Object.defineProperty(widget, "actions", {get: () => ({reset: {confirm: "Reset?", disabled}})})
    const feature = editor.features.widget
    expect(await feature.runAction(widget, "reset")).toBe(false)
    disabled = true
    expect(await feature.runAction(widget, "reset", true)).toBe(false)
    disabled = false
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    expect(await feature.runAction(widget, "reset", true)).toBe(true)
    expect(widget.getAttribute("count")).toBe("0")
    editor.doc.undo()
    expect(document.querySelector("demo-options")!.getAttribute("count")).toBe("3")
    editor.doc.redo()
    expect(document.querySelector("demo-options")!.getAttribute("count")).toBe("0")
  })

  it("reports async busy state and errors, then clears errors when retried", async () => {
    document.body.innerHTML = '<demo-options></demo-options>'
    const widget = document.querySelector("demo-options") as OptionsWidget
    let reject!: (error: Error) => void
    widget.reset = () => new Promise<void>((_resolve, fail) => { reject = fail }) as never
    const feature = editor.features.widget
    const running = feature.runAction(widget, "reset")
    expect(feature.getOptionsState([widget])!.actions[0].busy).toBe(true)
    expect(await feature.runAction(widget, "reset")).toBe(false)
    const failure = expect(running).rejects.toThrow("Cannot reset")
    reject(Error("Cannot reset"))
    await failure
    expect(feature.getOptionsState([widget])!.actions[0]).toMatchObject({error: "Cannot reset"})
    expect(feature.getOptionsState([widget])!.actions[0].busy).toBeUndefined()
    widget.reset = () => {}
    await feature.runAction(widget, "reset")
    expect(feature.getOptionsState([widget])!.actions[0].error).toBeUndefined()
  })
})


class AdvancedOptionsWidget extends HTMLElement {
  static options = {
    duration: {type: Number, control: "duration", min: 0, max: 100000, step: 0.25},
    blocks: {type: "select", multiple: true, control: "tree", options: [
      {label: "Movement", children: [{value: "move"}, {value: "turn"}]}, {value: "stop"},
    ]},
    source: {type: "reference", selector: "demo-options"},
  } satisfies Record<string, OptionDeclaration>
  static actions = {
    importFiles: {input: {type: "file", accept: ".txt,text/plain"}},
    importMany: {input: {type: "file", multiple: true}},
  } satisfies Record<string, ActionDeclaration>
  get duration() { return Number(this.getAttribute("duration") ?? 0) }
  get blocks() { return JSON.parse(this.getAttribute("blocks") ?? "[]") }
  get source() { return this.getAttribute("source") }
  async importFiles(files: File[]) { this.setAttribute("imported", await files[0].text()) }
  importMany(files: File[]) { this.setAttribute("count", String(files.length)) }
}
customElements.define("advanced-options-widget", AdvancedOptionsWidget)

function advancedWidget(html = '<advanced-options-widget id="advanced"></advanced-options-widget>') {
  document.body.innerHTML = html
  editor.schema.extendWidgets([{tagName: "advanced-options-widget"}])
  return document.querySelector("advanced-options-widget") as AdvancedOptionsWidget
}

const chooseActionFiles = async (picker: HTMLInputElement, files: File[]) => {
  Object.defineProperty(picker, "files", {configurable: true, value: files})
  picker.dispatchEvent(new Event("change"))
  await new Promise(resolve => setTimeout(resolve))
}

describe("specialized widget options", () => {
  it("stores durations as seconds and tree values as leaf IDs, preserving existing orphan values", () => {
    const widget = advancedWidget(`<advanced-options-widget duration="65.25" blocks='["move","unknown"]'></advanced-options-widget>`)
    const feature = editor.features.widget
    expect(feature.setOption(widget, "duration", 90061.25)).toBe(true)
    expect(feature.setOption(widget, "duration", -1)).toBe(false)
    expect(feature.setOption(widget, "duration", 1.1)).toBe(false)
    expect(feature.setOption(widget, "blocks", ["move", "unknown", "turn"])).toBe(true)
    expect(feature.setOption(widget, "blocks", ["move", "injected"])).toBe(false)
    expect(feature.setOption(widget, "blocks", ["Movement"])).toBe(false)
    expect(widget.getAttribute("duration")).toBe("90061.25")
    expect(JSON.parse(widget.getAttribute("blocks")!)).toEqual(["move", "unknown", "turn"])
    expect(editor.toHTML(true)).not.toMatch(/data-duration|data-tree-|control=/)
  })

  it("lists current unique authored widget IDs without creating IDs or exposing shadow contents", () => {
    const widget = advancedWidget('<advanced-options-widget source="gone"></advanced-options-widget><section><demo-options id="source" title="Training"></demo-options><demo-options></demo-options><demo-options id="duplicate"></demo-options><p id="duplicate">Other</p></section>')
    widget.attachShadow({mode: "open"}).innerHTML = '<demo-options id="shadow"></demo-options>'
    const anonymous = document.querySelector("section demo-options:not([id])")!
    const option = editor.features.widget.getOptionsState([widget])!.options.find(option => option.name === "source")!
    expect(option.choices).toEqual([{value: "source", label: "Training #source"}])
    expect(option.referenceMissing).toBe(true)
    expect(widget.getAttribute("source")).toBe("gone")
    expect(anonymous.hasAttribute("id")).toBe(false)
    expect(editor.features.widget.setOption(widget, "source", "duplicate")).toBe(false)
    expect(editor.features.widget.setOption(widget, "source", "shadow")).toBe(false)
    expect(editor.features.widget.setOption(widget, "source", "source")).toBe(true)
    document.querySelector("#source")!.remove()
    expect(editor.features.widget.setOption(widget, "source", "source")).toBe(false)
    expect(editor.features.widget.getOptionsState([widget])!.options.find(option => option.name === "source")!.referenceMissing).toBe(true)
    expect(editor.features.widget.setOption(widget, "source", null)).toBe(true)
  })

  it("fails safely for invalid reference selectors and excludes self unless explicitly allowed", () => {
    const widget = advancedWidget()
    Object.defineProperty(widget, "options", {configurable: true, value: {source: {type: "reference", selector: "["}}})
    expect(editor.features.widget.getOptionsState([widget])!.options[0]).toMatchObject({disabled: true, choices: []})
    expect(editor.features.widget.setOption(widget, "source", "advanced")).toBe(false)
    Object.defineProperty(widget, "options", {value: {source: {type: "reference", selector: "advanced-options-widget", excludeSelf: false}}})
    expect(editor.features.widget.setOption(widget, "source", "advanced")).toBe(true)
  })

  it("refreshes reference choices for direct and remote DOM replacements and ID changes", async () => {
    const widget = advancedWidget('<advanced-options-widget source="source"></advanced-options-widget><demo-options id="source"></demo-options>')
    editor.features.widget.getOptionsState([widget])
    await new Promise(resolve => setTimeout(resolve, 20))
    const post = vi.spyOn(editor, "postSelectionPath")
    try {
      const source = document.querySelector("#source")!
      source.id = "renamed"
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(post).toHaveBeenCalled()
      expect(editor.features.widget.getOptionsState([widget])!.options.find(option => option.name === "source")!.choices)
        .toEqual([{value: "renamed", label: "demo-options #renamed"}])
      editor.doc.syncFromDOM()
      const remote = new Y.Doc()
      Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc))
      const sharedSource = sharedDOMBody(remote).get(1) as Y.XmlElement
      sharedSource.setAttribute("id", "remote-source")
      Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(remote))
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(editor.features.widget.getOptionsState([widget])!.options.find(option => option.name === "source")!.choices)
        .toEqual([{value: "remote-source", label: "demo-options #remote-source"}])
      remote.destroy()
    }
    finally { post.mockRestore() }
  })
})

describe("widget file-input actions", () => {
  const picker = () => editor.appendix.querySelector<HTMLInputElement>('input[type="file"]')!

  it("uses appendix file inputs and invokes single or multiple File[] imports without storing picker artifacts", async () => {
    const widget = advancedWidget()
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {})
    try {
      const before = editor.toHTML(true)
      const feature = editor.features.widget
      expect(await feature.runAction(widget, "importFiles")).toBe(true)
      expect(picker().accept).toBe(".txt,text/plain")
      expect(picker().multiple).toBe(false)
      expect(editor.toHTML(true)).toBe(before)
      expect(sharedHTML()).not.toContain('type="file"')
      editor.doc.stopCapturing()
      await chooseActionFiles(picker(), [new File(["hello"], "source.txt", {type: "text/plain"})])
      expect(widget.getAttribute("imported")).toBe("hello")
      expect(picker()).toBeNull()
      editor.doc.undo()
      expect(document.querySelector("advanced-options-widget")!.hasAttribute("imported")).toBe(false)
      editor.doc.redo()
      const current = document.querySelector("advanced-options-widget")!
      expect(current.getAttribute("imported")).toBe("hello")
      await feature.runAction(current, "importMany")
      expect(picker().multiple).toBe(true)
      await chooseActionFiles(picker(), [new File(["a"], "a.txt"), new File(["b"], "b.txt")])
      expect(current.getAttribute("count")).toBe("2")
      expect(JSON.stringify(feature.getOptionsState([current]))).not.toContain("source.txt")
    }
    finally { click.mockRestore() }
  })

  it("cleans up cancellation, superseded pickers, detached targets, and destruction", async () => {
    const widget = advancedWidget()
    const method = vi.spyOn(widget, "importFiles")
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {})
    try {
      const feature = editor.features.widget
      await feature.runAction(widget, "importFiles")
      const first = picker()
      first.dispatchEvent(new Event("cancel"))
      expect(picker()).toBeNull()
      await feature.runAction(widget, "importFiles")
      const replaced = picker()
      await feature.runAction(widget, "importMany")
      expect(replaced.isConnected).toBe(false)
      expect(picker().multiple).toBe(true)
      picker().dispatchEvent(new Event("cancel"))
      await feature.runAction(widget, "importFiles")
      const stale = picker()
      widget.replaceWith(document.createElement("advanced-options-widget"))
      await chooseActionFiles(stale, [new File(["stale"], "stale.txt")])
      expect(method).not.toHaveBeenCalled()
      expect(picker()).toBeNull()
      const next = document.querySelector("advanced-options-widget")!
      await feature.runAction(next, "importFiles")
      feature.disable()
      expect(picker()).toBeNull()
      expect(await feature.runAction(next, "importFiles")).toBe(false)
      expect(picker()).toBeNull()
      feature.enable()
    }
    finally { click.mockRestore() }
  })

  it("rechecks current file declarations and availability when the chooser completes", async () => {
    const widget = advancedWidget()
    const method = vi.spyOn(widget, "importFiles")
    let disabled = false, accept = ".txt"
    Object.defineProperty(widget, "actions", {get: () => ({importFiles: {disabled, input: {type: "file", accept}}})})
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {})
    try {
      const feature = editor.features.widget
      await feature.runAction(widget, "importFiles")
      disabled = true
      await chooseActionFiles(picker(), [new File(["blocked"], "blocked.txt")])
      expect(method).not.toHaveBeenCalled()
      disabled = false
      await feature.runAction(widget, "importFiles")
      accept = ".json"
      await chooseActionFiles(picker(), [new File(["stale"], "stale.txt")])
      expect(method).not.toHaveBeenCalled()
      expect(picker()).toBeNull()
      expect(await feature.runAction(widget, "importFiles", false, [])).toBe(false)
      expect(await feature.runAction(widget, "importFiles", false, [new File([], "a"), new File([], "b")])).toBe(false)
    }
    finally { click.mockRestore() }
  })
})
