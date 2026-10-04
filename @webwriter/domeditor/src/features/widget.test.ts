// @vitest-environment happy-dom
import {afterAll, beforeEach, describe, expect, it, vi} from "vitest"
import * as Y from "yjs"
import {DOMEditor} from "../domeditor"
import {sharedDOMBody} from "../domdoc"
import {Schema} from "../schema"
import {$, isWidgetShadowInteraction} from "../utility"
import {isDataBlockType, stripActiveContent} from "../active-content"
import {isWidgetOptionsState} from "../widget-options"

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
    document.body.innerHTML = '<demo-options count="3" shuffled></demo-options>'
    const widget = document.querySelector("demo-options") as OptionsWidget
    const set = editor.getActionHandler("setWidgetOption")
    set({type: "setWidgetOption", path: [0], localName: "demo-options", name: "count", value: 5})
    set({type: "setWidgetOption", path: [0], localName: "demo-options", name: "shuffled", value: false})
    set({type: "setWidgetOption", path: [0], localName: "demo-options", name: "data", value: {a: [1]}})
    set({type: "setWidgetOption", path: [0], localName: "demo-options", name: "internal", value: "kept"})
    expect(editor.toHTML(true)).toBe('<demo-options count="5" widget-data="{&quot;a&quot;:[1]}"></demo-options>')
    expect(widget.internal).toBe("kept")
    expect(() => set({type: "setWidgetOption", path: [0], localName: "demo-options", name: "handler", value: "evil()"})).toThrow("cannot be set")
    expect(() => set({type: "setWidgetOption", path: [0], localName: "demo-options", name: "unknown", value: 1})).toThrow("no option")
    expect(() => set({type: "setWidgetOption", path: [0], localName: "other-widget", name: "count", value: 1})).toThrow("changed")
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
    expect(widget.getAttribute("shared")).toBe("")
    const rules = defaultGroupingRules("stable")
    group({type: "setWidgetGrouping", ...reference, grouping: rules})
    expect(widget.getAttribute("shared")).toBe("group")
    expect(widget.lastChild?.nodeType).toBe(7)
    expect(readWidgetGrouping(widget)).toEqual(rules)
    const state = editor.features.widget.getOptionsState([document.body, widget])!
    expect(isWidgetOptionsState(state)).toBe(true)
    expect(isWidgetOptionsState({...state, sharing: {...state.sharing, grouping: {version: 99}}})).toBe(false)
    share({type: "setWidgetSharing", ...reference, enabled: false})
    expect(widget.hasAttribute("shared")).toBe(false)
    expect(readWidgetGrouping(widget)).toEqual(rules)
    share({type: "setWidgetSharing", ...reference, enabled: true})
    expect(widget.getAttribute("shared")).toBe("group")
    group({type: "setWidgetGrouping", ...reference, grouping: null})
    expect(widget.getAttribute("shared")).toBe("")
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
    expect(readWidgetGrouping(widget)).toBeNull()
    editor.doc.redo()
    expect(widget.getAttribute("shared")).toBe("group")
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
