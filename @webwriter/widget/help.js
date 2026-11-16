import { ModuleCore } from "./base.js";
import { layoutLabels } from "./help/layout.js";
import { Messages } from "./messages.js";
import { helpMessages } from "./messages/help/index.js";
import { adoptStyles } from "./styles.js";
import { helpMessages as helpMessages2 } from "./messages/help/index.js";
import { connector, layoutLabels as layoutLabels2 } from "./help/layout.js";
const SIDES = ["bottom", "top", "right", "left"];
const ID = "ww-help-";
const GAP = 6;
const PAD = 4;
const MARKER = 18;
const REGION = 8;
const LIST_SHARE = 0.6;
const LIST_MIN = 56;
const SVG = "http://www.w3.org/2000/svg";
const FOCUSABLE = `button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])`;
const REFLECTS = typeof Element !== "undefined" && "ariaDescribedByElements" in Element.prototype;
const css = `
:host { position: relative; }
[data-ww-help-layer] { display: contents; }
[data-ww-help-backdrop] { position: absolute; inset: 0; z-index: 1900; background: rgb(0 0 0 / 0.1); }
[data-ww-help-lines] { position: absolute; inset: 0; z-index: 2000; width: 100%; height: 100%; overflow: visible; pointer-events: none; fill: none; stroke: white; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
[data-ww-help-lines] > [data-ww-help-outline] { stroke: rgb(39 39 42 / 0.7); stroke-width: 4; }
[data-ww-help-label], [data-ww-help-list] > li {
    box-sizing: border-box; padding: 0 8px; border: 1px solid var(--sl-color-neutral-200, #e4e4e7); border-radius: 3px;
    background: var(--sl-color-neutral-50, #fafafa); color: var(--sl-color-neutral-700, #3f3f46);
    box-shadow: 0 0 0 1px rgb(39 39 42 / 0.1), 0 1px 3px rgb(39 39 42 / 0.3);
    font: 12px/1.6 var(--sl-font-sans, system-ui, sans-serif); overflow-wrap: anywhere;
}
[data-ww-help-label] { position: absolute; left: 0; top: 0; z-index: 2000; width: max-content; max-width: 14em; margin: 0; cursor: default; }
[data-ww-help-label][data-ww-help-anchored] { inset: auto; margin: ${GAP}px; }
[data-ww-help-marker] {
    position: absolute; z-index: 2000; box-sizing: border-box; width: ${MARKER}px; height: ${MARKER}px; border-radius: 50%;
    background: var(--sl-color-neutral-700, #3f3f46); color: white; box-shadow: 0 0 0 1.5px white;
    font: bold 11px/${MARKER}px var(--sl-font-sans, system-ui, sans-serif); text-align: center; pointer-events: none;
}
[data-ww-help-list] {
    position: absolute; inset: auto auto ${PAD}px ${PAD}px; z-index: 2000; box-sizing: border-box; width: max-content; max-width: calc(100% - ${2 * PAD}px);
    overflow: hidden auto; scrollbar-gutter: stable; margin: 0; padding: 2px;
    display: flex; flex-direction: column; align-items: flex-start; gap: 4px; list-style: none;
}
[data-ww-help-list]:focus-visible { outline: 2px solid Highlight; }
[data-ww-help-list] > li { flex: none; max-width: 100%; }
[data-ww-help-list] > li::before { content: counter(list-item) ". "; font-weight: bold; }
`;
function part(tag, name) {
  const element = document.createElement(tag);
  element.setAttribute(`data-ww-help-${name}`, "");
  return element;
}
function innerControl(element) {
  let found = null;
  for (let next = element.shadowRoot?.querySelector(FOCUSABLE); next; next = next.shadowRoot?.querySelector(FOCUSABLE)) found = next;
  return found;
}
class HelpCore extends ModuleCore {
  /** Tether labels with CSS anchor positioning. Without it every label is placed from measured rectangles. */
  anchor;
  #messages;
  #state = { open: false, form: null };
  #styles = null;
  #anchors = 0;
  /** Ends what runs only while the overlay is open. */
  #opened = null;
  /** The rectangles the last layout was made for. */
  #seen = "";
  /** Controls inside custom elements, with what described them before the overlay opened. */
  #inner = /* @__PURE__ */ new Map();
  constructor(host, options = {}) {
    super(host, options);
    this.#messages = new Messages(host, helpMessages, options.messages);
    this.anchor = options.anchor ?? (CSS.supports("position-area", "bottom") && CSS.supports("position-try-fallbacks", "top"));
  }
  getSnapshot() {
    return this.#state;
  }
  /** Opens or closes the overlay. For menus; a `data-ww-help-toggle` button needs no code. */
  toggle(force) {
    this.#set(force ?? !this.#state.open, false);
  }
  /** Closes the overlay. */
  close() {
    this.#set(false, false);
  }
  onConnect() {
    const root = this.root;
    this.#styles = adoptStyles(root, css);
    this.cleanup(this.#styles);
    this.#anchors = 0;
    this.cleanup(this.#messages.follow(() => this.refresh()));
    this.listen(root, "click", (event) => this.#click(event));
    this.listen(root, "focusin", (event) => {
      if (!event.target.closest?.("[data-ww-help-layer]")) this.#relayout();
    });
    this.cleanup(() => {
      this.#opened?.abort();
      this.#state = { open: false, form: null };
      this.#clear();
      this.#toggles();
      this.#styles = this.#opened = null;
    });
  }
  onRefresh() {
    this.#toggles();
    this.#relayout();
  }
  #set(open, refocus) {
    if (!this.connected || open === this.#state.open) return;
    this.#state = { open, form: open ? this.#layout() : null };
    if (open) this.#watch();
    else {
      this.#opened?.abort();
      this.#opened = null;
      this.#clear();
    }
    this.#toggles();
    if (!open && refocus) this.root.querySelector("[data-ww-help-toggle]")?.focus();
    this.notify();
  }
  /** What exists only while the overlay is open: the Escape key for the whole page, and the look at the elements once per frame. */
  #watch() {
    const opened = this.#opened = new AbortController();
    window.addEventListener("keydown", (event) => this.#key(event), { capture: true, signal: opened.signal });
    const check = () => {
      frame = requestAnimationFrame(check);
      if (this.#measure().signature !== this.#seen) this.#relayout();
    };
    let frame = requestAnimationFrame(check);
    opened.signal.addEventListener("abort", () => cancelAnimationFrame(frame), { once: true });
  }
  #relayout() {
    if (!this.#state.open) return;
    const form = this.#layout();
    if (form === this.#state.form) return;
    this.#state = { open: true, form };
    this.notify();
  }
  #click(event) {
    const target = event.target;
    const toggle = target.closest?.("[data-ww-help-toggle]");
    if (toggle && this.root.contains(toggle)) return this.#set(!this.#state.open, true);
    const layer = target.closest?.("[data-ww-help-layer]");
    if (layer && this.root.contains(layer) && !target.closest("[data-ww-help-list]")) this.#set(false, true);
  }
  /** Escape closes the overlay and is consumed, so that it does nothing else on the page. */
  #key(event) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    const active = document.activeElement;
    this.#set(false, !active || active === document.body || this.host.contains(active));
  }
  #toggles() {
    const pressed = String(this.#state.open);
    for (const toggle of this.root.querySelectorAll("[data-ww-help-toggle]")) {
      if (toggle.getAttribute("aria-pressed") !== pressed) toggle.setAttribute("aria-pressed", pressed);
    }
  }
  /** The marked elements that are rendered, visible and inside the widget, in rank order, and where they are. */
  #measure() {
    const base = this.host.getBoundingClientRect();
    const rank = (element) => {
      const order = element.dataset.wwHelpOrder?.trim() ? Number(element.dataset.wwHelpOrder) : NaN;
      return Number.isFinite(order) ? order : Infinity;
    };
    const found = [];
    for (const element of this.root.querySelectorAll("[data-ww-help]")) {
      if (!element.dataset.wwHelp.trim() || !element.checkVisibility({ visibilityProperty: true })) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || rect.left >= base.right || rect.right <= base.left || rect.top >= base.bottom || rect.bottom <= base.top) continue;
      const place = [rect.left - base.left, rect.top - base.top, rect.width, rect.height].map((value) => Math.round(value * 2)).join(",");
      found.push({ element, rank: rank(element), index: found.length, place });
    }
    found.sort((a, b) => a.rank === b.rank ? a.index - b.index : a.rank - b.rank);
    const signature = [Math.round(base.width * 2), Math.round(base.height * 2), ...found.map((each) => each.place)].join(" ");
    return { targets: found.map((each) => each.element), ranked: found.map((each) => each.rank < Infinity), signature };
  }
  /** Makes label `i` the description of element `i` and removes descriptions that no longer apply. */
  #describe(targets, labels) {
    const write = (element, id) => {
      const others = (element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter((token) => token && !token.startsWith(ID));
      const value = [...others, ...id ? [id] : []].join(" ");
      if (!value) element.removeAttribute("aria-describedby");
      else if (element.getAttribute("aria-describedby") !== value) element.setAttribute("aria-describedby", value);
    };
    for (const element of this.root.querySelectorAll(`[aria-describedby*="${ID}"]`)) if (!targets.includes(element)) write(element, null);
    targets.forEach((target, i) => write(target, ID + i));
    const sheet = this.#styles?.sheet;
    for (; sheet && this.#anchors < targets.length; this.#anchors++) {
      sheet.insertRule(`[aria-describedby~="${ID}${this.#anchors}"] { anchor-name: --${ID}${this.#anchors}; }`, sheet.cssRules.length);
    }
    const inner = /* @__PURE__ */ new Map();
    targets.forEach((target, i) => {
      const control = innerControl(target);
      if (control) inner.set(control, labels[i]);
    });
    for (const [control, before] of this.#inner) {
      if (inner.has(control)) continue;
      if (typeof before === "string") control.setAttribute("aria-description", before);
      else if (REFLECTS) control.ariaDescribedByElements = before;
      else control.removeAttribute("aria-description");
      this.#inner.delete(control);
    }
    for (const [control, label] of inner) {
      if (!this.#inner.has(control)) this.#inner.set(control, REFLECTS ? control.ariaDescribedByElements ?? null : control.getAttribute("aria-description"));
      const before = this.#inner.get(control);
      if (REFLECTS) control.ariaDescribedByElements = [...before ?? [], label];
      else control.setAttribute("aria-description", label.textContent ?? "");
    }
  }
  #clear() {
    for (const child of [...this.root.children]) if (child.hasAttribute("data-ww-help-layer")) child.remove();
    this.#describe([], []);
    this.#seen = "";
  }
  /** Builds the layer from what the template shows now. */
  #layout() {
    const root = this.root;
    const layer = [...root.children].find((child) => child.hasAttribute("data-ww-help-layer")) ?? part("div", "layer");
    if (root.lastElementChild !== layer) root.append(layer);
    const backdrop = part("div", "backdrop");
    const old = layer.querySelector("[data-ww-help-list]");
    const kept = old && { scroll: old.scrollTop, focused: root.activeElement === old };
    layer.replaceChildren(backdrop);
    const { targets, ranked, signature } = this.#measure();
    this.#seen = signature;
    const base = backdrop.getBoundingClientRect();
    const texts = targets.map((target) => target.dataset.wwHelp.trim());
    const labels = texts.map((text, i) => {
      const label = part("div", "label");
      label.id = ID + i;
      label.setAttribute("role", "tooltip");
      label.textContent = text;
      return label;
    });
    layer.append(...labels);
    this.#describe(targets, labels);
    const local = (rect) => ({ left: rect.left - base.left, top: rect.top - base.top, right: rect.right - base.left, bottom: rect.bottom - base.top });
    const bounds = { left: PAD, top: PAD, right: base.width - PAD, bottom: base.height - PAD };
    const items = targets.map((target, i) => {
      const rect = local(target.getBoundingClientRect());
      const box = { left: Math.max(rect.left, 0), top: Math.max(rect.top, 0), right: Math.min(rect.right, base.width), bottom: Math.min(rect.bottom, base.height) };
      const { width, height } = labels[i].getBoundingClientRect();
      const side = target.dataset.wwHelpSide;
      const sides = SIDES.includes(side) ? [side, ...SIDES.filter((other) => other !== side)] : SIDES;
      const [w, h] = [box.right - box.left, box.bottom - box.top];
      return { target: box, width, height, sides, region: w >= width + 2 * GAP && h >= height + 2 * GAP && w * h >= REGION * width * height };
    });
    if (this.anchor) {
      labels.forEach((label, i) => {
        label.setAttribute("data-ww-help-anchored", "");
        label.style.setProperty("position-anchor", `--${ID}${i}`);
        label.style.setProperty("position-area", items[i].region ? "center" : items[i].sides[0]);
        if (!items[i].region) label.style.setProperty("position-try-fallbacks", items[i].sides.slice(1).join(", "));
      });
      labels.forEach((label, i) => items[i].css = local(label.getBoundingClientRect()));
    }
    const focused = root.activeElement;
    const avoid = [];
    if (focused && !targets.includes(focused) && !focused.closest("[data-ww-help-layer]")) {
      const box = local(focused.getBoundingClientRect());
      if ((box.right - box.left) * (box.bottom - box.top) < base.width * base.height / 4) avoid.push(box);
    }
    const turn = (i) => ranked[i] ? 0 : items[i].region ? 2 : 1;
    const sequence = items.map((_, i) => i).sort((a, b) => turn(a) - turn(b) || a - b);
    const found = layoutLabels(
      bounds,
      sequence.map((i) => items[i]),
      avoid
    );
    if (!found) {
      const list = this.#list(layer, backdrop, texts, targets, items, base);
      if (kept) list.scrollTop = kept.scroll;
      if (kept?.focused) list.focus();
      return "list";
    }
    const placed = items.map((_, i) => found[sequence.indexOf(i)]);
    const lines = document.createElementNS(SVG, "svg");
    lines.setAttribute("data-ww-help-lines", "");
    lines.setAttribute("aria-hidden", "true");
    const outlines = [];
    placed.forEach(({ box, line, css: kept2 }, i) => {
      if (line) {
        const path = lines.appendChild(document.createElementNS(SVG, "path"));
        path.setAttribute("data-ww-help-for", ID + i);
        path.setAttribute("d", `M${line.map((point) => point.join(" ")).join("L")}`);
        const outline = path.cloneNode();
        outline.removeAttribute("data-ww-help-for");
        outline.setAttribute("data-ww-help-outline", "");
        outlines.push(outline);
      }
      if (kept2) return;
      labels[i].removeAttribute("data-ww-help-anchored");
      labels[i].style.cssText = `left: ${box.left}px; top: ${box.top}px;`;
    });
    lines.prepend(...outlines);
    backdrop.after(lines);
    return "labels";
  }
  /**
   * Too little space: numbered markers on the elements and the texts in one
   * numbered list, as wide as its longest entry. The list takes the tallest
   * band of the widget that is free of the toggle and of the markers beside
   * it, at most 60 % of the height, and scrolls beyond that. In a very small
   * widget it keeps room for two entries; markers are drawn over it then.
   */
  #list(layer, backdrop, texts, targets, items, base) {
    const spots = items.map(({ target }) => ({
      left: Math.min(Math.max(target.left - MARKER / 3, 0), base.width - MARKER),
      top: Math.min(Math.max(target.top - MARKER / 3, 0), base.height - MARKER)
    }));
    const markers = spots.map((spot, i) => {
      const marker = part("span", "marker");
      marker.setAttribute("aria-hidden", "true");
      marker.textContent = String(i + 1);
      marker.style.left = `${spot.left}px`;
      marker.style.top = `${spot.top}px`;
      return marker;
    });
    const list = part("ol", "list");
    list.tabIndex = 0;
    list.setAttribute("aria-label", this.#messages.current.list);
    const entries = texts.map((text, i) => {
      const item = document.createElement("li");
      item.id = ID + i;
      item.textContent = text;
      return item;
    });
    list.append(...entries);
    layer.replaceChildren(backdrop, list, ...markers);
    this.#describe(targets, entries);
    const reach = list.getBoundingClientRect().right - base.left + PAD;
    const toggle = [...this.root.querySelectorAll("[data-ww-help-toggle]")].find((element) => element.checkVisibility())?.getBoundingClientRect();
    const taken = spots.filter((spot) => spot.left < reach).map((spot) => [spot.top, spot.top + MARKER]);
    if (toggle && toggle.left - base.left < reach) taken.push([toggle.top - base.top, toggle.bottom - base.top]);
    taken.sort((a, b) => a[0] - b[0]);
    const [first, last] = [PAD, base.height - PAD];
    let band = { from: first, to: first };
    let from = first;
    for (const [top, bottom] of [...taken, [last + PAD, last + PAD]]) {
      if (top - PAD - from >= band.to - band.from) band = { from, to: top - PAD };
      from = Math.max(from, bottom + PAD);
    }
    const most = base.height * LIST_SHARE;
    const height = Math.max(Math.min(most, band.to - band.from), Math.min(LIST_MIN, most));
    list.style.maxHeight = `${height}px`;
    if (band.from === first && band.to < last) list.style.inset = `${first}px auto auto ${PAD}px`;
    else list.style.bottom = `${Math.max(Math.min(base.height - band.to, last - height), PAD)}px`;
    return list;
  }
}
export {
  HelpCore,
  connector,
  helpMessages2 as helpMessages,
  layoutLabels2 as layoutLabels
};
