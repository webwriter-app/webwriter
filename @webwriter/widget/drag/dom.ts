import {composedContains} from "./geometry.js"

/** The name of an item or target in announcements: `data-ww-label`, its `aria-label`, or its text. */
export function label(element: HTMLElement): string {
  return element.dataset.wwLabel ?? element.getAttribute("aria-label") ?? element.textContent?.trim().replace(/\s+/g, " ") ?? ""
}

/** `data-ww-drop-max` of a target, or null without one. */
export function capacity(target: HTMLElement): number | null {
  const max = target.dataset.wwDropMax
  return max === undefined || !Number.isFinite(Number(max)) ? null : Number(max)
}

/** The keys in `data-ww-drop-linked` of a target. */
export function linked(target: HTMLElement): string[] {
  return (target.dataset.wwDropLinked ?? "").split(/\s+/).filter(Boolean)
}

/** The focused element, through open shadow roots. */
export function activeElement(document: Document): Element | null {
  let active = document.activeElement
  while(active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
  return active
}

/** Moves a node in front of `reference`, keeping its state where the browser can. */
export function relocate(node: HTMLElement, parent: ParentNode & Node, reference: Node | null) {
  if(reference === node) reference = node.nextSibling
  if(node.parentNode === parent && node.nextSibling === reference) return
  const active = activeElement(node.ownerDocument)
  try {
    // Keeps focus, selection and the state of a child widget.
    ;(parent as ParentNode & Node & {moveBefore(node: Node, child: Node | null): void}).moveBefore(node, reference)
  } catch {
    parent.insertBefore(node, reference)
    // Inserting again dropped the focus if it was inside the node.
    if(active instanceof HTMLElement && activeElement(node.ownerDocument) !== active && composedContains(node, active)) active.focus()
  }
}

/** Sets the `slot` attribute of an authored child, the default slot being no attribute. */
export function assign(node: HTMLElement, slot: string) {
  if((node.getAttribute("slot") ?? "") === slot) return
  if(slot) node.setAttribute("slot", slot)
  else node.removeAttribute("slot")
}
