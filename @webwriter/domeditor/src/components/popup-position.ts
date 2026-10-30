/** Native popup attachment with flipping and a full-width positioning area
 * when neither inline alignment fits. The anchor utility installs the tries. */
export function popupAnchorCSS(gap = 4) {
  return `inset:auto;position-area:bottom span-right;justify-self:start;align-self:start;margin:${gap}px 0;
    max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);
    position-try-fallbacks:flip-block,flip-inline,flip-block flip-inline,--ww-ui-popup-below,--ww-ui-popup-above;
    position-visibility:anchors-visible;`
}

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
  popup.style.setProperty("--popup-join-left", `${button.left - menu.left}px`)
  popup.style.setProperty("--popup-join-width", `${Math.max(0, button.width - 2)}px`)
  const left = Math.abs(menu.left - button.left) < .5
  const right = Math.abs(menu.right - button.right) < .5
  popup.style.setProperty("--popup-border-radius", below
    ? `${left ? "0" : ".35rem"} ${right ? "0" : ".35rem"} .35rem .35rem`
    : `.35rem .35rem ${right ? "0" : ".35rem"} ${left ? "0" : ".35rem"}`)
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
