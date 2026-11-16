import { flatParent } from "./geometry.js";
const EDGE = 64;
const STEP = 12;
function depthOf(element) {
  let depth = 0;
  for (let node = flatParent(element); node; node = flatParent(node)) depth++;
  return depth;
}
class AutoScroll {
  #scrollers = [];
  /** `targets` are the candidates of the drag. Call before anything is lifted. */
  constructor(targets) {
    const page = document.scrollingElement;
    const seen = /* @__PURE__ */ new Set();
    for (const target of targets) {
      for (let node = target; node && node !== page && node !== document.body; node = flatParent(node)) {
        if (seen.has(node)) break;
        seen.add(node);
        const style = getComputedStyle(node);
        const maxX = /auto|scroll/.test(style.overflowX) ? node.scrollWidth - node.clientWidth : 0;
        const maxY = /auto|scroll/.test(style.overflowY) ? node.scrollHeight - node.clientHeight : 0;
        if (maxX > 0 || maxY > 0) this.#scrollers.push({ element: node, page: false, depth: depthOf(node), maxX, maxY });
      }
    }
    this.#scrollers.sort((a, b) => b.depth - a.depth);
    if (page) {
      this.#scrollers.push({ element: page, page: true, depth: 0, maxX: Math.max(0, page.scrollWidth - page.clientWidth), maxY: Math.max(0, page.scrollHeight - page.clientHeight) });
    }
  }
  /** One step for a pointer at this client position. Call once per frame. Returns whether something scrolled. */
  step(x, y) {
    for (const scroller of this.#scrollers) {
      const { element } = scroller;
      if (!element.isConnected) continue;
      const box = scroller.page ? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight } : element.getBoundingClientRect();
      if (x < box.left || x > box.right || y < box.top || y > box.bottom) continue;
      const towards = (at, start, end) => {
        const edge = Math.min(EDGE, (end - start) / 4);
        return at < start + edge ? -1 : at > end - edge ? 1 : 0;
      };
      const dx = towards(x, box.left, box.right);
      const dy = towards(y, box.top, box.bottom);
      const rtl = getComputedStyle(element).direction === "rtl";
      const left = dx ? clamp(element.scrollLeft + dx * STEP, rtl ? -scroller.maxX : 0, rtl ? 0 : scroller.maxX) : element.scrollLeft;
      const top = dy ? clamp(element.scrollTop + dy * STEP, 0, scroller.maxY) : element.scrollTop;
      if (Math.abs(left - element.scrollLeft) < 0.5 && Math.abs(top - element.scrollTop) < 0.5) continue;
      element.scrollLeft = left;
      element.scrollTop = top;
      return true;
    }
    return false;
  }
}
function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}
export {
  AutoScroll
};
