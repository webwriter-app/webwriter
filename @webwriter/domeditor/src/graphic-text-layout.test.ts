// @vitest-environment happy-dom
import {describe, expect, it, vi} from "vitest"
import {copyGraphicTextLayoutCache, fitGraphicTextBox, wrapGraphicShapeLabel} from "./graphic-text-layout"
import {graphicPresetPath, readGraphicPreset} from "./graphic-shapes"

const svg = "http://www.w3.org/2000/svg"
const frame = {x: 180, y: 90, width: 640, height: 420}

function fixture(content = "Text") {
  const host = document.createElement("div")
  const appendix = host.attachShadow({mode: "open"})
  const group = document.createElementNS(svg, "g")
  const path = document.createElementNS(svg, "path")
  path.setAttribute("aria-label", "Text box")
  path.setAttribute("d", graphicPresetPath("text-box", frame))
  path.setAttribute("fill", "none")
  path.setAttribute("stroke", "none")
  const text = document.createElementNS(svg, "text")
  text.textContent = content
  text.style.fontSize = "20px"
  group.append(path, text)
  return {appendix, group, path, text}
}

const fittedBounds = (path: Element) => readGraphicPreset(path)!.bounds

describe("intrinsic SVG text-box layout", () => {
  it("preserves deliberately positioned or unfamiliar text without normalizing it", () => {
    const {appendix,group,text}=fixture()
    const span=document.createElementNS(svg,"tspan")
    span.setAttribute("x","17");span.setAttribute("dy","3em");span.setAttribute("rotate","15")
    span.textContent="Positioned"
    text.replaceChildren(span)
    const before=group.outerHTML
    expect(fitGraphicTextBox(group,appendix)).toBe(false)
    expect(group.outerHTML).toBe(before)
    expect(appendix.children).toHaveLength(0)
  })

  it("upgrades legacy multiline labels without replacing their authored runs", () => {
    const {appendix,group,text,path}=fixture()
    text.setAttribute("x","500")
    const first=document.createElementNS(svg,"tspan"),second=document.createElementNS(svg,"tspan")
    first.setAttribute("x","500");first.setAttribute("dy","-0.6em");first.setAttribute("font-weight","700");first.textContent="First"
    second.setAttribute("x","500");second.setAttribute("dy","1.2em");second.textContent="Second"
    text.replaceChildren(first,second)
    expect(fitGraphicTextBox(group,appendix)).toBe(true)
    expect(text.textContent).toBe("First\nSecond")
    expect(text.firstChild).toBe(first)
    expect(text.lastChild).toBe(second)
    expect(first.getAttribute("font-weight")).toBe("700")
    expect(first.hasAttribute("x")).toBe(false)
    expect(readGraphicPreset(path)!.bounds.height).toBeGreaterThan(40)
  })

  it("fits short text to its content and keeps the previous frame center", () => {
    const {appendix, group, path, text} = fixture("Hi")
    expect(fitGraphicTextBox(group, appendix)).toBe(true)
    const bounds = fittedBounds(path)
    expect(bounds.width).toBeLessThan(frame.width)
    expect(bounds.height).toBeLessThan(frame.height)
    expect(bounds.x + bounds.width / 2).toBeCloseTo(frame.x + frame.width / 2)
    expect(bounds.y + bounds.height / 2).toBeCloseTo(frame.y + frame.height / 2)
    expect(text.getAttribute("x")!.split(/\s+/)).toHaveLength(2)
    expect(text.getAttribute("y")!.split(/\s+/)).toHaveLength(2)
    expect(appendix.children).toHaveLength(0)
  })

  it("grows and shrinks after text and font-size edits", () => {
    const {appendix, group, path, text} = fixture("short")
    fitGraphicTextBox(group, appendix)
    const short = fittedBounds(path)
    text.textContent = "A substantially longer piece of text"
    fitGraphicTextBox(group, appendix)
    const longer = fittedBounds(path)
    expect(longer.width).toBeGreaterThan(short.width)
    text.textContent = "x"
    fitGraphicTextBox(group, appendix)
    const smaller = fittedBounds(path)
    expect(smaller.width).toBeLessThan(longer.width)
    text.style.fontSize = "32px"
    fitGraphicTextBox(group, appendix)
    expect(fittedBounds(path).height).toBeGreaterThan(smaller.height)
  })

  it("wraps long words and paragraphs at the maximum content width", () => {
    const content = `${"extraordinarilylongword".repeat(5)} ${"word ".repeat(80)}`
    const {appendix, group, path, text} = fixture(content)
    fitGraphicTextBox(group, appendix)
    const bounds = fittedBounds(path)
    expect(bounds.width, `style=${text.style.inlineSize}, computed=${getComputedStyle(text).inlineSize}`).toBeLessThanOrEqual(496.0001)
    expect(bounds.height).toBeGreaterThan(100)
    const ys = text.getAttribute("y")!.split(/\s+/).map(Number)
    expect(new Set(ys).size).toBeGreaterThan(1)
    text.style.inlineSize = "200px"
    fitGraphicTextBox(group, appendix)
    expect(fittedBounds(path).width).toBeLessThanOrEqual(216.0001)
    expect(fittedBounds(path).height).toBeGreaterThan(bounds.height)
    expect(appendix.children).toHaveLength(0)
  })

  it.each(["first\nsecond", "first\n", ""]) ("preserves explicit line structure for %j", content => {
    const {appendix, group, path, text} = fixture(content)
    fitGraphicTextBox(group, appendix)
    const bounds = fittedBounds(path)
    expect(text.textContent).toBe(content)
    expect(bounds.height).toBeGreaterThan(39.9)
    if(content.endsWith("\n")) {
      const single = fixture("first")
      fitGraphicTextBox(single.group, single.appendix)
      expect(bounds.height).toBeGreaterThan(fittedBounds(single.path).height)
    }
    expect(text.hasAttribute("x")).toBe(true)
    expect(text.hasAttribute("y")).toBe(true)
    expect(appendix.children).toHaveLength(0)
  })

  it("keeps rich authored runs, links, attributes, and selection endpoints intact", () => {
    const {appendix, group, path, text} = fixture()
    text.replaceChildren()
    const bold = document.createElementNS(svg, "tspan")
    bold.setAttribute("font-weight", "700")
    bold.textContent = "Rich "
    const link = document.createElementNS(svg, "a")
    link.setAttribute("href", "https://example.test/")
    link.setAttribute("aria-label", "reference")
    const linkedRun = document.createElementNS(svg, "tspan")
    linkedRun.textContent = "text"
    link.append(linkedRun)
    text.append(bold, link)
    const range = document.createRange()
    range.setStart(linkedRun.firstChild!, 1)
    range.setEnd(linkedRun.firstChild!, 3)
    document.getSelection()!.removeAllRanges()
    document.getSelection()!.addRange(range)
    const authoredChildren = [...text.childNodes]
    fitGraphicTextBox(group, appendix)
    expect([...text.childNodes]).toEqual(authoredChildren)
    expect(link.getAttribute("href")).toBe("https://example.test/")
    expect(link.getAttribute("aria-label")).toBe("reference")
    expect(bold.getAttribute("font-weight")).toBe("700")
    expect(document.getSelection()!.anchorNode).toBe(linkedRun.firstChild)
    expect(document.getSelection()!.focusNode).toBe(linkedRun.firstChild)
    expect(readGraphicPreset(path)).not.toBeNull()
  })

  it("emits per-character coordinates by Unicode code point rather than UTF-16 surrogate", () => {
    const {appendix, group, text} = fixture("A😀B")
    fitGraphicTextBox(group, appendix)
    expect(text.getAttribute("x")!.trim().split(/\s+/)).toHaveLength(3)
    expect(text.getAttribute("y")!.trim().split(/\s+/)).toHaveLength(3)
  })
})

function ordinaryFixture(content: string) {
  const host=document.createElement("div"),appendix=host.attachShadow({mode:"open"})
  const shape=document.createElementNS(svg,"g"),geometry=document.createElementNS(svg,"rect"),text=document.createElementNS(svg,"text")
  geometry.setAttribute("x","100");geometry.setAttribute("y","100");geometry.setAttribute("width","200");geometry.setAttribute("height","120")
  text.style.fontSize="20px"
  text.textContent=content
  shape.append(geometry,text)
  return {appendix,shape,geometry,text}
}

describe("default SVG shape label wrapping", () => {
  it("wraps native label runs within the shape width without changing geometry", () => {
    const content="A long unbrokenwordthatexceedsaline plus several ordinary words that must wrap into the shape."
    const {appendix,shape,geometry,text}=ordinaryFixture(content)
    const original=geometry.outerHTML,bounds={x:100,y:100,width:200,height:120}
    expect(wrapGraphicShapeLabel(shape,appendix,bounds)).toBe(true)
    expect(geometry.outerHTML).toBe(original)
    expect(text.textContent).toBe(content)
    expect(text.querySelectorAll("tspan")).toHaveLength(0)
    expect(text.style.inlineSize).toBe("184px")
    expect(text.getAttribute("x")!.trim().split(/\s+/)).toHaveLength(Array.from(content).length)
    expect(new Set(text.getAttribute("y")!.trim().split(/\s+/)).size).toBeGreaterThan(1)
    expect(appendix.children).toHaveLength(0)
  })

  it("reflows after width and font edits while keeping the shape frame fixed", () => {
    const content="A long line of label content that wraps several times at the original size."
    const {appendix,shape,geometry,text}=ordinaryFixture(content)
    const original=geometry.outerHTML
    const first={x:100,y:100,width:200,height:120}
    wrapGraphicShapeLabel(shape,appendix,first)
    const firstYs=text.getAttribute("y")!
    const wider={...first,width:320}
    wrapGraphicShapeLabel(shape,appendix,wider)
    expect(text.style.inlineSize).toBe("304px")
    expect(text.getAttribute("y")).not.toBe(firstYs)
    text.style.fontSize="30px"
    wrapGraphicShapeLabel(shape,appendix,wider)
    expect(text.getAttribute("y")).not.toBe(firstYs)
    expect(geometry.outerHTML).toBe(original)
  })

  it("preserves rich text nodes, links, attributes, and selection endpoints", () => {
    const {appendix,shape,text}=ordinaryFixture("")
    const bold=document.createElementNS(svg,"tspan")
    bold.setAttribute("font-weight","700");bold.textContent="Rich "
    const anchor=document.createElementNS(svg,"a")
    anchor.setAttribute("href","https://example.test/" )
    anchor.setAttribute("aria-label","reference")
    const italic=document.createElementNS(svg,"tspan")
    italic.setAttribute("font-style","italic");italic.textContent="text that wraps"
    anchor.append(italic);text.append(bold,anchor)
    const range=document.createRange()
    range.setStart(italic.firstChild!,2);range.setEnd(italic.firstChild!,8)
    document.getSelection()!.removeAllRanges();document.getSelection()!.addRange(range)
    const children=[...text.childNodes]
    wrapGraphicShapeLabel(shape,appendix,{x:100,y:100,width:120,height:120})
    expect([...text.childNodes]).toEqual(children)
    expect(anchor.getAttribute("href")).toBe("https://example.test/")
    expect(anchor.getAttribute("aria-label")).toBe("reference")
    expect(bold.getAttribute("font-weight")).toBe("700")
    expect(document.getSelection()!.anchorNode).toBe(italic.firstChild)
    expect(document.getSelection()!.focusNode).toBe(italic.firstChild)
  })

  it("scales a label down when it exceeds shape height and removes the scale when it fits", () => {
    const {appendix,shape,geometry,text}=ordinaryFixture("wrapped content ".repeat(80))
    const original=geometry.outerHTML
    wrapGraphicShapeLabel(shape,appendix,{x:100,y:100,width:200,height:100})
    expect(Number(text.style.scale)).toBeLessThan(1)
    const fittedLines=new Set(text.getAttribute("y")!.split(/\s+/)).size
    wrapGraphicShapeLabel(shape,appendix,{x:100,y:100,width:200,height:20000})
    expect(new Set(text.getAttribute("y")!.split(/\s+/)).size).toBeGreaterThan(fittedLines)
    expect(text.style.scale).toBe("")
    expect(geometry.outerHTML).toBe(original)
    wrapGraphicShapeLabel(shape,appendix,{x:100,y:100,width:400,height:2000})
    expect(text.style.scale).toBe("")
    expect(geometry.outerHTML).toBe(original)
  })

  it("reuses measured text metrics across warm resize widths and returns early for an unchanged frame", () => {
    const {appendix,shape,text}=ordinaryFixture("A long label whose wrapping changes through the resize frames. ".repeat(8))
    const widths=[200,214,228,242,256,270,284,298,312,326,340,354,368,382,396,410,424,438,452,466]
    expect(wrapGraphicShapeLabel(shape,appendix,{x:100,y:100,width:widths[0],height:220})).toBe(true)
    const probe=vi.spyOn(document,"createElementNS")
    for(const width of widths.slice(1)) expect(wrapGraphicShapeLabel(shape,appendix,{x:100,y:100,width,height:220})).toBe(true)
    expect(probe.mock.calls.filter(([namespace,name])=>namespace===svg && name==="svg")).toHaveLength(0)
    const before=text.outerHTML
    expect(wrapGraphicShapeLabel(shape,appendix,{x:100,y:100,width:widths.at(-1)!,height:220})).toBe(false)
    expect(text.outerHTML).toBe(before)
    expect(probe.mock.calls.filter(([namespace,name])=>namespace===svg && name==="svg")).toHaveLength(0)
    probe.mockRestore()
  })

  it("invalidates cached derived metrics when text content or rich-run font changes", () => {
    const {appendix,shape,text}=ordinaryFixture("Text content for a cached layout")
    expect(wrapGraphicShapeLabel(shape,appendix,{x:100,y:100,width:240,height:160})).toBe(true)
    const probe=vi.spyOn(document,"createElementNS")
    text.firstChild!.textContent="Changed authored content that must be remeasured"
    expect(wrapGraphicShapeLabel(shape,appendix,{x:100,y:100,width:240,height:160})).toBe(true)
    expect(probe.mock.calls.filter(([namespace,name])=>namespace===svg && name==="svg")).toHaveLength(1)
    const run=document.createElementNS(svg,"tspan")
    run.style.fontWeight="700";run.textContent=" rich run"
    text.append(run)
    expect(wrapGraphicShapeLabel(shape,appendix,{x:100,y:100,width:240,height:160})).toBe(true)
    expect(probe.mock.calls.filter(([namespace,name])=>namespace===svg && name==="svg")).toHaveLength(2)
    probe.mockRestore()
  })

  it("shares only derived layout metrics with a preview clone", () => {
    const {appendix,shape,text}=ordinaryFixture("Preview clones reuse native label metrics across resize frames. ".repeat(5))
    wrapGraphicShapeLabel(shape,appendix,{x:100,y:100,width:240,height:150})
    const preview=shape.cloneNode(true) as SVGGElement
    const sourceText=shape.querySelector("text")!,previewText=preview.querySelector("text")!
    expect(previewText).not.toBe(sourceText)
    const authoredX=sourceText.getAttribute("x")
    copyGraphicTextLayoutCache(shape,preview)
    const probe=vi.spyOn(document,"createElementNS")
    expect(wrapGraphicShapeLabel(preview,appendix,{x:100,y:100,width:320,height:190})).toBe(true)
    expect(probe.mock.calls.filter(([namespace,name])=>namespace===svg && name==="svg")).toHaveLength(0)
    expect(previewText.getAttribute("x")).not.toBe(authoredX)
    expect(sourceText.getAttribute("x")).toBe(authoredX)
    expect(previewText).not.toBe(sourceText)
    probe.mockRestore()
  })
})
