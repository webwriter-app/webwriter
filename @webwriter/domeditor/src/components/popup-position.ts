export type FixedPopupPosition = {left: number, top: number}

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
