// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {defaultGroupingRules, groupingTarget} from "./widget-grouping.js"
import {hydrateWidgetGroupings, prepareWidgetGroupingsForSerialization, readWidgetGrouping, restoreWidgetGroupingClones, widgetGroupingRevision, writeWidgetGrouping} from "./widget-grouping-dom"

describe("portable widget grouping instructions", () => {
  afterEach(() => document.body.replaceChildren())

  it("reads, writes, removes, and rejects duplicate or invalid native instructions", () => {
    const widget = document.createElement("ww-card")
    const rules = defaultGroupingRules("seed")
    writeWidgetGrouping(widget, rules)
    expect(readWidgetGrouping(widget)).toEqual(rules)
    expect(widgetGroupingRevision(widget)).toBe(encodeURIComponent(JSON.stringify(rules)))
    widget.append(document.createProcessingInstruction(groupingTarget, "bad"))
    expect(() => readWidgetGrouping(widget)).toThrow(/Duplicate/)
    writeWidgetGrouping(widget, null)
    expect(readWidgetGrouping(widget)).toBeNull()
    widget.append(document.createProcessingInstruction(groupingTarget, "bad"))
    expect(() => readWidgetGrouping(widget)).toThrow(/Invalid/)
  })

  it("hydrates parsed HTML carrier comments, including template contents", () => {
    const rules = defaultGroupingRules("seed")
    const encoded = encodeURIComponent(JSON.stringify(rules))
    const root = document.createElement("section")
    root.innerHTML = `<!--?ww-grouping ${encoded}?--><template><!--?ww-grouping ${encoded}?--><!--?ww-grouping %7Bbad?--></template><!--other-->`
    hydrateWidgetGroupings(root)
    expect(root.firstChild?.nodeType).toBe(7)
    const template = root.querySelector("template")!
    expect(template.content.firstChild?.nodeType).toBe(7)
    expect(template.content.lastChild?.nodeType).toBe(8)
    expect(template.content.lastChild?.textContent).toBe("?ww-grouping %7Bbad?")
    expect(root.lastChild?.textContent).toBe("other")
  })

  it("prepares a clone for serialization without normalizing document structure or script text", () => {
    const rules = defaultGroupingRules("seed")
    const encoded = encodeURIComponent(JSON.stringify(rules))
    const source = document.createElement("section")
    const widget = document.createElement("ww-card")
    widget.append(document.createProcessingInstruction(groupingTarget, encoded))
    widget.append(document.createProcessingInstruction("other-target", "keep raw"))
    const template = document.createElement("template")
    template.content.append(document.createProcessingInstruction(groupingTarget, encoded))
    source.append(widget, template)
    const clone = source.cloneNode(true) as Element
    restoreWidgetGroupingClones(source, clone)
    expect((clone.firstChild!.firstChild as ProcessingInstruction).target).toBe(groupingTarget)
    const restore = prepareWidgetGroupingsForSerialization(clone)
    expect(clone.firstChild!.childNodes[0].nodeType).toBe(8)
    expect(clone.firstChild!.childNodes[1].nodeType).toBe(8)
    expect(clone.querySelector("template")!.content.firstChild!.nodeType).toBe(8)

    const groupingMarker = (clone.firstChild!.childNodes[0] as Comment).data
    const otherMarker = (clone.firstChild!.childNodes[1] as Comment).data
    const templateMarker = (clone.querySelector("template")!.content.firstChild as Comment).data
    const html = `<!doctype html><html><head><title>Keep</title></head><body><ww-card><!--${groupingMarker}--><!--${otherMarker}--></ww-card><template><!--${templateMarker}--></template><script>const carrier = "<!--?ww-grouping ${encoded}?-->"</script></body></html>`
    const serialized = restore(html)
    expect(serialized.startsWith("<!doctype html><html><head><title>Keep</title>" )).toBe(true)
    expect(serialized).toContain(`<?ww-grouping ${encoded}?>`)
    expect(serialized).toContain("<?other-target keep raw?>")
    expect(serialized).toContain(`<script>const carrier = "<!--?ww-grouping ${encoded}?-->"</script>`)
    expect(serialized.match(/<\?ww-grouping /g)).toHaveLength(2)
  })

  it("restores PI children skipped by runtime clone implementations", () => {
    const source = document.createElement("div")
    source.append(document.createProcessingInstruction(groupingTarget, "data"), document.createTextNode("a"))
    const sourceTemplate = document.createElement("template")
    sourceTemplate.content.append(document.createProcessingInstruction("other", "template data"))
    source.append(sourceTemplate)
    const clone = source.cloneNode(true) as Element
    clone.firstChild?.remove()
    clone.querySelector("template")!.content.replaceChildren()
    restoreWidgetGroupingClones(source, clone)
    expect(clone.firstChild?.nodeType).toBe(7)
    expect(clone.querySelector("template")!.content.firstChild?.nodeType).toBe(7)
  })

  it("leaves a no-PI clone untouched, including recursively nested template contents", () => {
    const source = document.createElement("section")
    source.innerHTML = "<p><!--keep--><b>text</b></p><template><template><i>nested</i></template></template>"
    const clone = source.cloneNode(true) as Element
    const paragraph = clone.firstElementChild
    const outerTemplate = clone.querySelector("template")!
    const innerTemplate = outerTemplate.content.querySelector("template")!
    const createTreeWalker = vi.spyOn(document, "createTreeWalker")
    const observer = new MutationObserver(() => {})
    observer.observe(clone, {childList: true, subtree: true, characterData: true})
    observer.observe(outerTemplate.content, {childList: true, subtree: true, characterData: true})
    observer.observe(innerTemplate.content, {childList: true, subtree: true, characterData: true})

    try {
      expect(restoreWidgetGroupingClones(source, clone)).toBe(clone)
      expect(createTreeWalker).toHaveBeenCalled()
      expect(clone.firstElementChild).toBe(paragraph)
      expect(clone.querySelector("template")!.content.querySelector("template")).toBe(innerTemplate)
      expect(observer.takeRecords()).toEqual([])
    }
    finally {
      createTreeWalker.mockRestore()
      observer.disconnect()
    }
  })

  it("restores arbitrary processing instructions through nested templates across documents", () => {
    const sourceDocument = document.implementation.createHTMLDocument()
    const source = sourceDocument.createElement("section")
    const outer = sourceDocument.createElement("template")
    const inner = sourceDocument.createElement("template")
    outer.content.append("before", sourceDocument.createProcessingInstruction("custom-target", "outer data"), inner)
    inner.content.append(sourceDocument.createProcessingInstruction("nested-target", "nested data"), "after")
    source.append(outer)

    const cloneDocument = document.implementation.createHTMLDocument()
    const clone = cloneDocument.importNode(source, true) as Element
    const cloneOuter = clone.querySelector("template")!
    const cloneInner = cloneOuter.content.querySelector("template")!
    cloneOuter.content.childNodes[1].remove()
    cloneInner.content.firstChild!.remove()

    restoreWidgetGroupingClones(source, clone)

    const restoredOuterInstruction = cloneOuter.content.childNodes[1] as ProcessingInstruction
    const restoredInnerInstruction = cloneInner.content.firstChild as ProcessingInstruction
    expect([restoredOuterInstruction.target, restoredOuterInstruction.data]).toEqual(["custom-target", "outer data"])
    expect([restoredInnerInstruction.target, restoredInnerInstruction.data]).toEqual(["nested-target", "nested data"])
    expect(restoredOuterInstruction.ownerDocument).toBe(cloneDocument)
    expect(restoredInnerInstruction.ownerDocument).toBe(cloneDocument)
    expect(cloneOuter.content.firstChild?.textContent).toBe("before")
    expect(cloneInner.content.lastChild?.textContent).toBe("after")
  })

  it("treats namespaced elements named template as ordinary elements", () => {
    const source = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    const svgTemplate = document.createElementNS("http://www.w3.org/2000/svg", "template")
    svgTemplate.append(document.createProcessingInstruction("custom-target", "svg data"))
    source.append(svgTemplate)
    const clone = source.cloneNode(true) as Element
    const cloneSvgTemplate = clone.firstElementChild!
    cloneSvgTemplate.firstChild!.remove()

    restoreWidgetGroupingClones(source, clone)

    const instruction = cloneSvgTemplate.firstChild as ProcessingInstruction
    expect(svgTemplate.namespaceURI).toBe("http://www.w3.org/2000/svg")
    expect("content" in svgTemplate).toBe(false)
    expect([instruction.target, instruction.data]).toEqual(["custom-target", "svg data"])

    const restoreHTML = prepareWidgetGroupingsForSerialization(clone)
    const marker = (cloneSvgTemplate.firstChild as Comment).data
    expect(restoreHTML(`<!--${marker}-->`)).toBe("<?custom-target svg data?>")

    const encoded = encodeURIComponent(JSON.stringify(defaultGroupingRules("svg-template")))
    cloneSvgTemplate.append(document.createComment(`?${groupingTarget} ${encoded}?`))
    hydrateWidgetGroupings(clone)
    const hydratedInstruction = cloneSvgTemplate.lastChild as ProcessingInstruction
    expect([hydratedInstruction.target, hydratedInstruction.data]).toEqual([groupingTarget, encoded])
  })

  it("does not treat meta content text as a template fragment", () => {
    const source = document.implementation.createHTMLDocument()
    const meta = source.createElement("meta")
    meta.setAttribute("content", "value")
    source.head.append(meta)
    const clone = source.cloneNode(true) as Document

    expect(restoreWidgetGroupingClones(source, clone)).toBe(clone)
    expect(clone.head.querySelector("meta")?.getAttribute("content")).toBe("value")
  })
})
