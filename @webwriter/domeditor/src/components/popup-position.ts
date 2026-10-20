export type FixedPopupPosition = {left: number, top: number}

/** Match the ribbon buttons' shared border after a popup has been positioned. */
export function connectPopup(trigger: HTMLElement, popup: HTMLElement) {
  const button = trigger.getBoundingClientRect(), menu = popup.getBoundingClientRect()
  const below = Math.abs(menu.top - button.bottom + 1) < .5
  const above = Math.abs(menu.bottom - button.top - 1) < .5
  if(!below && !above) {
    trigger.removeAttribute("data-connected")
    popup.removeAttribute("data-connected")
    return
  }
  const placement = below ? "below" : "above"
  trigger.setAttribute("data-connected", placement)
  popup.setAttribute("data-connected", placement)
  popup.style.setProperty("--popup-join-left", `${button.left - menu.left + 1}px`)
  popup.style.setProperty("--popup-join-width", `${Math.max(0, button.width - 2)}px`)
  const left = Math.abs(menu.left - button.left) < .5
  const right = Math.abs(menu.right - button.right) < .5
  popup.style.setProperty("--popup-border-radius", below
    ? `${left ? "0" : ".35rem"} ${right ? "0" : ".35rem"} .35rem .35rem`
    : `.35rem .35rem ${right ? "0" : ".35rem"} ${left ? "0" : ".35rem"}`)
}

/** Native color popups open below a one-pixel anchor beside their palette. */
export function anchorColorSubmenu(input: HTMLInputElement, popup: HTMLElement, option: HTMLElement) {
  input.style.left = `${popup.getBoundingClientRect().right + 4}px`
  input.style.top = `${option.getBoundingClientRect().top - 1}px`
}

/** Place a fixed popup beside its trigger, keeping its origin inside the viewport. */
export function fixedPopupPosition(
  trigger: Pick<DOMRectReadOnly, "left" | "top" | "bottom">,
  popup: Pick<DOMRectReadOnly, "width" | "height">,
  viewport: {width: number, height: number},
  margin = 8,
  gap = 4,
): FixedPopupPosition {
  const left = Math.min(
    Math.max(margin, trigger.left),
    Math.max(margin, viewport.width - popup.width - margin),
  )
  const below = trigger.bottom + gap
  const top = below + popup.height <= viewport.height - margin
    ? below
    : Math.max(margin, trigger.top - popup.height - gap)
  return {left, top}
}
