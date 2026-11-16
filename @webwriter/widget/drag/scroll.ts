import {flatParent} from "./geometry.js"

const EDGE = 64 // px from an edge at which scrolling starts, at most a quarter of the box
const STEP = 12 // px per frame

type Scroller = {
  element: Element
  /** The page's scrolling element: its edges are those of the window. */
  page: boolean
  depth: number
  maxX: number
  maxY: number
}

function depthOf(element: Element): number {
  let depth = 0
  for(let node = flatParent(element); node; node = flatParent(node)) depth++
  return depth
}

/**
 * Scrolls what the pointer is held at the edge of during a drag: a scrollable
 * target, or a scrollable box around a target, and after those the page.
 *
 * How far each of them scrolls is read when the drag starts. A lifted item
 * that is moved past the end of its container would otherwise extend the
 * container, and the scrolling would never end.
 */
export class AutoScroll {
  readonly #scrollers: Scroller[] = []

  /** `targets` are the candidates of the drag. Call before anything is lifted. */
  constructor(targets: readonly Element[]) {
    const page = document.scrollingElement
    const seen = new Set<Element>()
    for(const target of targets) {
      for(let node: Element | null = target; node && node !== page && node !== document.body; node = flatParent(node)) {
        if(seen.has(node)) break
        seen.add(node)
        const style = getComputedStyle(node)
        const maxX = /auto|scroll/.test(style.overflowX) ? node.scrollWidth - node.clientWidth : 0
        const maxY = /auto|scroll/.test(style.overflowY) ? node.scrollHeight - node.clientHeight : 0
        if(maxX > 0 || maxY > 0) this.#scrollers.push({element: node, page: false, depth: depthOf(node), maxX, maxY})
      }
    }
    // The innermost box that can scroll is asked first.
    this.#scrollers.sort((a, b) => b.depth - a.depth)
    if(page) {
      this.#scrollers.push({element: page, page: true, depth: 0, maxX: Math.max(0, page.scrollWidth - page.clientWidth), maxY: Math.max(0, page.scrollHeight - page.clientHeight)})
    }
  }

  /** One step for a pointer at this client position. Call once per frame. Returns whether something scrolled. */
  step(x: number, y: number): boolean {
    for(const scroller of this.#scrollers) {
      const {element} = scroller
      if(!element.isConnected) continue
      const box = scroller.page ? {left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight} : element.getBoundingClientRect()
      if(x < box.left || x > box.right || y < box.top || y > box.bottom) continue
      const towards = (at: number, start: number, end: number) => {
        const edge = Math.min(EDGE, (end - start) / 4)
        return at < start + edge ? -1 : at > end - edge ? 1 : 0
      }
      const dx = towards(x, box.left, box.right)
      const dy = towards(y, box.top, box.bottom)
      // A right-to-left box scrolls from 0 down to the negative maximum.
      const rtl = getComputedStyle(element).direction === "rtl"
      const left = dx ? clamp(element.scrollLeft + dx * STEP, rtl ? -scroller.maxX : 0, rtl ? 0 : scroller.maxX) : element.scrollLeft
      const top = dy ? clamp(element.scrollTop + dy * STEP, 0, scroller.maxY) : element.scrollTop
      if(Math.abs(left - element.scrollLeft) < 0.5 && Math.abs(top - element.scrollTop) < 0.5) continue
      element.scrollLeft = left
      element.scrollTop = top
      return true
    }
    return false
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}
