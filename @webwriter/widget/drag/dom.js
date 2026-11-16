import { composedContains } from "./geometry.js";
function label(element) {
  return element.dataset.wwLabel ?? element.getAttribute("aria-label") ?? element.textContent?.trim().replace(/\s+/g, " ") ?? "";
}
function capacity(target) {
  const max = target.dataset.wwDropMax;
  return max === void 0 || !Number.isFinite(Number(max)) ? null : Number(max);
}
function linked(target) {
  return (target.dataset.wwDropLinked ?? "").split(/\s+/).filter(Boolean);
}
function activeElement(document) {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}
function relocate(node, parent, reference) {
  if (reference === node) reference = node.nextSibling;
  if (node.parentNode === parent && node.nextSibling === reference) return;
  const active = activeElement(node.ownerDocument);
  try {
    ;
    parent.moveBefore(node, reference);
  } catch {
    parent.insertBefore(node, reference);
    if (active instanceof HTMLElement && activeElement(node.ownerDocument) !== active && composedContains(node, active)) active.focus();
  }
}
function assign(node, slot) {
  if ((node.getAttribute("slot") ?? "") === slot) return;
  if (slot) node.setAttribute("slot", slot);
  else node.removeAttribute("slot");
}
export {
  activeElement,
  assign,
  capacity,
  label,
  linked,
  relocate
};
