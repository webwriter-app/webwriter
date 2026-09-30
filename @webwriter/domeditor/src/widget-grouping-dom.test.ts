// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
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
})
