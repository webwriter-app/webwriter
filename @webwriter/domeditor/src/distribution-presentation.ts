import {createAnchorPositioner} from "./anchor-positioning.js"
import {readDistributionConfigs} from "./distribution-dom"
import {fixedClientX} from "./utility"

const markerPart = "distribution-private-marker"
const markerPosition = "left:max(0px, calc(anchor(left) - 6px));top:anchor(top);height:anchor-size(height);position-visibility:anchors-visible;"
const markerStyles = `
  body::part(distribution-private-markers) {display: contents;}
  body::part(${markerPart}) {
    position: fixed;
    width: 4px;
    border-radius: 2px;
    background: #a340bb;
    pointer-events: none;
    z-index: 2147483600;
  }
  @media print { body::part(${markerPart}) {display: none;} }
`

/** Show the edge of each private region without styling or modifying its content. */
export function observePrivateDistributionRegions(root: Document, appendToEditor?: (layer: HTMLElement) => void) {
  const view = root.defaultView!
  const anchors = createAnchorPositioner(root)
  const markers = new Map<Element, HTMLElement>()
  const graphicMarkers = new Map<Element, HTMLElement>()
  const layer = root.createElement("div")
  layer.setAttribute("part", "distribution-private-markers")
  layer.setAttribute("aria-hidden", "true")
  let sheet: CSSStyleSheet | undefined
  let frame: number | undefined
  const updateGraphicMarkers = () => {
    if(!graphicMarkers.size || frame !== undefined) return
    frame = view.requestAnimationFrame(() => {
      frame = undefined
      const positions = Array.from(graphicMarkers, ([target, marker]) => ({marker, box: target.getBoundingClientRect(),
        visibility: view.getComputedStyle(target).visibility}))
      for(const {marker, box, visibility} of positions) Object.assign(marker.style, {
        left: `${Math.max(0, fixedClientX(box.left, root) - 6)}px`, top: `${box.top}px`, height: `${box.height}px`, visibility,
      })
    })
  }
  const resize = new view.ResizeObserver(updateGraphicMarkers)
  const geometryObserver = new view.MutationObserver(updateGraphicMarkers)

  const refresh = () => {
    const hidden = new Set<Element>()
    try {
      for(const [target, config] of readDistributionConfigs(root)) {
        if(config.view !== false) continue
        if(target && (target === root.documentElement || root.body?.contains(target))) hidden.add(target)
      }
    }
    catch { /* Invalid policies are reported by the distribution controls. */ }
    const regions = new Set([...hidden].filter(target => {
      for(let ancestor = target.parentElement; ancestor; ancestor = ancestor.parentElement) if(hidden.has(ancestor)) return false
      return true
    }))
    const hadGraphicMarkers = graphicMarkers.size > 0
    for(const [target, marker] of markers) {
      if(regions.has(target) && marker.isConnected) continue
      anchors.release(marker)
      if(graphicMarkers.delete(target)) resize.unobserve(target)
      marker.remove()
      markers.delete(target)
    }
    if(regions.size && !layer.isConnected) {
      if(appendToEditor) appendToEditor(layer)
      else {
        const appendix = root.body.shadowRoot ?? root.body.attachShadow({mode: "open"})
        if(!appendix.querySelector("slot:not([name])")) appendix.prepend(root.createElement("slot"))
        appendix.append(layer)
      }
    }
    if(regions.size && !sheet) {
      sheet = new view.CSSStyleSheet()
      sheet.replaceSync(markerStyles)
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet]
    }
    for(const target of regions) {
      if(markers.has(target)) continue
      const marker = root.createElement("span")
      marker.setAttribute("part", markerPart)
      layer.append(marker)
      markers.set(target, marker)
      // Inner SVG shapes have client bounds but lack a CSS anchor box.
      if((target as SVGElement).ownerSVGElement) {
        graphicMarkers.set(target, marker)
        resize.observe(target)
      }
      else anchors.bind(marker, target, markerPosition)
    }
    if(graphicMarkers.size && !hadGraphicMarkers) {
      geometryObserver.observe(root, {childList: true, subtree: true, characterData: true, attributes: true})
      resize.observe(root.documentElement)
    }
    else if(!graphicMarkers.size && hadGraphicMarkers) {
      geometryObserver.disconnect()
      resize.disconnect()
    }
    updateGraphicMarkers()
  }
  const observer = new view.MutationObserver(records => {
    if(records.some(record => record.target === root.head || record.target.parentNode === root.head
      || record.attributeName === "id" || record.type === "characterData" && [7, 8].includes(record.target.nodeType)
      || record.type === "childList" && [...record.addedNodes, ...record.removedNodes].some(node => [1, 7, 8].includes(node.nodeType)))) refresh()
  })
  observer.observe(root, {childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["id"]})
  root.addEventListener("scroll", updateGraphicMarkers, {capture: true, passive: true})
  view.addEventListener("resize", updateGraphicMarkers)
  refresh()
  return () => {
    observer.disconnect()
    geometryObserver.disconnect()
    resize.disconnect()
    root.removeEventListener("scroll", updateGraphicMarkers, true)
    view.removeEventListener("resize", updateGraphicMarkers)
    if(frame !== undefined) view.cancelAnimationFrame(frame)
    anchors.destroy()
    layer.remove()
    markers.clear()
    if(sheet) root.adoptedStyleSheets = root.adoptedStyleSheets.filter(style => style !== sheet)
  }
}
