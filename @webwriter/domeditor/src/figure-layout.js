/** Shape-aware caption flow, shared by editing and standalone documents.
 * Generated rules and temporary markers never become document content. */
export function captionedFigureContent(figure) {
  if(!figure.matches("figure:not([is])")) return null
  const children = Array.from(figure.children)
  if(children.filter(child => child.localName === "figcaption").length !== 1
    || children.filter(child => child.localName !== "figcaption").length !== 1
    || Array.from(figure.childNodes).some(node => node.nodeType === 3 && node.textContent.trim())) return null
  return children.find(child => child.localName !== "figcaption")
}

export function createFigureLayout(doc) {
  const view = doc.defaultView, body = doc.body
  const sheet = new view.CSSStyleSheet()
  doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet]
  const markers = new Map(), observed = new Set()
  const unmark = (figure, marker) => {
    figure.classList.remove(marker)
    if(!figure.classList.length) figure.removeAttribute("class")
  }
  let sequence = 0, frame = 0, destroyed = false
  const angle = value => {
    const token = (value || "0").trim().split(/\s+/).at(-1)
    const number = parseFloat(token) || 0
    return token.endsWith("turn") ? number * 360 : token.endsWith("grad") ? number * .9
      : token.endsWith("rad") ? number * 180 / Math.PI : number
  }
  const refresh = () => {
    if(destroyed) return
    // Documents without figures need no generated rules or stylesheet reset.
    if(!markers.size && !body.querySelector("figure:not([is])")) return
    // Measure the live authored layout, including stylesheet and remote edits.
    sheet.replaceSync("")
    const rules = [], active = new Set(), pendingMarkers = []
    const watch = new Set([body])
    for(const figure of body.querySelectorAll("figure:not([is])")) {
      let atomic = false
      for(let parent = figure.parentElement; parent && parent !== body; parent = parent.parentElement) {
        if(parent.localName.includes("-") || parent.hasAttribute("is")) { atomic = true; break }
      }
      if(atomic || figure.closest("[hidden]")) continue
      const content = captionedFigureContent(figure)
      if(!content) continue
      const caption = figure.querySelector(":scope > figcaption")
      watch.add(figure)
      watch.add(content)
      const style = view.getComputedStyle(content), parentStyle = view.getComputedStyle(figure)
      if(style.display === "none" || parentStyle.writingMode && parentStyle.writingMode !== "horizontal-tb") continue
      const scale = (style.getPropertyValue("scale") || "1").split(/\s+/).map(value => value.endsWith("%") ? parseFloat(value) / 100 : parseFloat(value))
      const sx = Number.isFinite(scale[0]) ? scale[0] : 1, sy = Number.isFinite(scale[1]) ? scale[1] : sx
      const matrix = new view.DOMMatrix().rotate(angle(style.getPropertyValue("rotate"))).scale(sx, sy)
        .multiply(new view.DOMMatrix(style.transform && style.transform !== "none" ? style.transform : undefined))
      if(!matrix.is2D || Math.abs(matrix.a - 1) + Math.abs(matrix.b) + Math.abs(matrix.c) + Math.abs(matrix.d - 1) < 1e-6 || Math.abs(matrix.a * matrix.d - matrix.b * matrix.c) < 1e-8) continue
      const extra = properties => properties.reduce((sum, property) => sum + (parseFloat(style[property]) || 0), 0)
      const width = content.offsetWidth || parseFloat(style.width) + (style.boxSizing === "border-box" ? 0 : extra(["paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth"]))
      const height = content.offsetHeight || parseFloat(style.height) + (style.boxSizing === "border-box" ? 0 : extra(["paddingTop", "paddingBottom", "borderTopWidth", "borderBottomWidth"]))
      const available = figure.clientWidth - (parseFloat(parentStyle.paddingLeft) || 0) - (parseFloat(parentStyle.paddingRight) || 0)
      if(!(width > 0 && height > 0 && available > 0)) continue
      const points = [[0, 0], [width, 0], [width, height], [0, height]].map(([x, y]) => ({x: matrix.a * x + matrix.c * y, y: matrix.b * x + matrix.d * y}))
      const left = Math.min(...points.map(point => point.x)), top = Math.min(...points.map(point => point.y))
      const right = Math.max(...points.map(point => point.x)), bottom = Math.max(...points.map(point => point.y))
      const boxWidth = right - left, boxHeight = bottom - top
      const inset = (available - boxWidth) / 2
      const origin = style.transformOrigin.split(/\s+/).map(parseFloat)
      const ox = origin[0] || 0, oy = origin[1] || 0
      // The live transform keeps its origin and translation; placement aligns
      // its visible bounds with the same polygon used for text exclusion.
      const translate = style.getPropertyValue("translate").split(/\s+/)
      const length = (value, size) => (parseFloat(value) || 0) * (value?.endsWith("%") ? size / 100 : 1)
      const tx = matrix.e + ox - matrix.a * ox - matrix.c * oy + length(translate[0], width)
      const ty = matrix.f + oy - matrix.b * ox - matrix.d * oy + length(translate[1], height)
      const below = caption !== figure.firstElementChild
      const captionStyle = view.getComputedStyle(caption)
      const alignment = captionStyle.textAlign
      const rightAligned = alignment === "right" || alignment === "end" && captionStyle.direction !== "rtl"
        || alignment === "start" && captionStyle.direction === "rtl"
      const side = rightAligned ? "left" : "right"
      let marker = markers.get(figure)
      if(!marker) { marker = `◆figure-flow-${++sequence}`; markers.set(figure, marker); pendingMarkers.push([figure, marker]) }
      active.add(figure)
      const selector = `.${marker}`
      const contour = points.map(point => ({x: point.x - left + inset, y: point.y - top}))
      // Fill slivers narrower than a few words. Otherwise themes that allow
      // emergency word wrapping can turn a caption into one-letter lines.
      const minimum = Math.min(available, Math.max(64, (parseFloat(captionStyle.fontSize) || 16) * 6))
      const boundary = side === "left" ? available - minimum : minimum
      const narrow = point => side === "left" ? point.x > boundary : point.x < boundary
      const edge = side === "left" ? available : 0
      const exclusion = []
      for(let index = 0; index < contour.length; index++) {
        const start = contour[index], end = contour[(index + 1) % contour.length]
        exclusion.push({x: narrow(start) ? edge : start.x, y: start.y})
        if(narrow(start) !== narrow(end)) {
          const y = start.y + (end.y - start.y) * (boundary - start.x) / (end.x - start.x)
          exclusion.push(...(narrow(start) ? [{x: edge, y}, {x: boundary, y}] : [{x: boundary, y}, {x: edge, y}]))
        }
      }
      const polygon = exclusion.map(point => `${point.x}px ${point.y}px`).join(", ")
      rules.push(`${selector} { display: flow-root !important; ${parentStyle.position === "static" ? "position: relative !important;" : ""} }
${selector}::before { content: ""; float: ${side}; width: 100%; height: ${boxHeight}px; shape-outside: polygon(${polygon}); shape-margin: 8px; pointer-events: none; }
${selector} > :not(figcaption) { position: absolute !important; float: none !important; margin: 0 !important; left: ${inset - left - tx + (parseFloat(parentStyle.paddingLeft) || 0)}px !important; top: ${-top - ty + (parseFloat(parentStyle.paddingTop) || 0)}px !important; right: auto !important; bottom: auto !important; width: ${style.width === "auto" ? `${width}px` : style.width} !important; height: ${style.height === "auto" ? `${height}px` : style.height} !important; }
${selector} > figcaption { display: block; margin: 0; min-height: ${boxHeight}px; box-sizing: border-box; padding-top: ${below ? boxHeight / 2 : 0}px; }`)
    }
    for(const [figure, marker] of markers) if(!active.has(figure)) { unmark(figure, marker); markers.delete(figure) }
    for(const [figure, marker] of pendingMarkers) figure.classList.add(marker)
    sheet.replaceSync(rules.join("\n"))
    for(const element of observed) if(!watch.has(element)) { resize?.unobserve(element); observed.delete(element) }
    for(const element of watch) if(!observed.has(element)) { resize?.observe(element); observed.add(element) }
  }
  const schedule = () => {
    if(!frame && !destroyed) frame = view.requestAnimationFrame(() => { frame = 0; refresh() })
  }
  const observer = new view.MutationObserver(records => {
    if(records.some(record => record.type !== "attributes" || record.attributeName !== "class"
      || (record.oldValue || "").split(/\s+/).filter(name => !name.startsWith("◆")).join(" ")
        !== Array.from(record.target.classList).filter(name => !name.startsWith("◆")).join(" "))) schedule()
  })
  observer.observe(body, {subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true})
  observer.observe(doc.head, {subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true})
  const resize = typeof view.ResizeObserver === "function" ? new view.ResizeObserver(schedule) : null
  body.addEventListener("load", schedule, true)
  view.addEventListener("resize", schedule)
  refresh()
  return {refresh, destroy() {
    destroyed = true
    observer.disconnect()
    resize?.disconnect()
    view.cancelAnimationFrame(frame)
    body.removeEventListener("load", schedule, true)
    view.removeEventListener("resize", schedule)
    for(const [figure, marker] of markers) unmark(figure, marker)
    markers.clear()
    doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter(current => current !== sheet)
  }}
}
