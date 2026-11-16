// The standard zoom buttons of Viewport: what they look like, how they are
// filled into `data-ww-viewport-controls` elements and how a click is read.
import type {ViewportMessages} from "../viewport.js"

/** What a standard button does. */
export type ViewportAction = "out" | "in" | "reset" | "fit"

/** What the buttons show. */
export type ControlsState = {
  scale: number
  min: number
  max: number
  /** No button does anything: the reader may not change the view, or there is no view yet. */
  locked: boolean
  messages: ViewportMessages
}

const EPSILON = 1e-6
const fitIcon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg>`
const buttons: {action: ViewportAction; content: string; keys: string}[] = [
  {action: "out", content: "−", keys: "-"},
  {action: "in", content: "+", keys: "+"},
  {action: "reset", content: "", keys: ""},
  {action: "fit", content: fitIcon, keys: "0"},
]

/** The look of the buttons. `:where()` keeps the specificity at zero, so a widget's own rules win. */
export const controlsCss = `
:where([data-ww-viewport-controls]) { display: inline-flex; align-items: center; gap: 2px; padding: 2px; border-radius: 6px; background: Canvas; color: CanvasText; box-shadow: 0 0 0 1px rgb(0 0 0 / 0.15); }
:where([data-ww-viewport-action]) { display: inline-grid; place-items: center; min-width: 28px; height: 28px; padding: 0 4px; border: 0; border-radius: 4px; background: none; color: inherit; font: 13px/1 system-ui, sans-serif; cursor: pointer; }
:where([data-ww-viewport-action]:hover:not([aria-disabled="true"])) { background: rgb(0 0 0 / 0.08); }
:where([data-ww-viewport-action][aria-disabled="true"]) { opacity: 0.4; cursor: default; }
`

const own = ":scope > [data-ww-viewport-action]"

/**
 * Fills every `data-ww-viewport-controls` element that has no buttons yet and
 * brings names, the percent text and the disabled state up to date. A button
 * that can do nothing is marked `aria-disabled`, so it keeps keyboard focus.
 */
export function renderControls(root: ShadowRoot, state: ControlsState): void {
  const {scale, min, max, locked, messages} = state
  const percent = Math.round(scale * 100)
  const names: Record<ViewportAction, string> = {out: messages.zoomOut, in: messages.zoomIn, reset: messages.reset(percent), fit: messages.fit}
  const text = messages.percent(percent)
  for(const box of root.querySelectorAll("[data-ww-viewport-controls]")) {
    if(!box.querySelector(own)) {
      box.append(
        ...buttons.map(({action, content, keys}) => {
          const button = document.createElement("button")
          button.type = "button"
          button.setAttribute("data-ww-viewport-action", action)
          if(keys) button.setAttribute("aria-keyshortcuts", keys)
          button.innerHTML = content
          return button
        }),
      )
    }
    for(const button of box.querySelectorAll<HTMLButtonElement>(own)) {
      const action = button.getAttribute("data-ww-viewport-action") as ViewportAction
      const disabled = locked || (action === "out" && scale <= min + EPSILON) || (action === "in" && scale >= max - EPSILON)
      if((button.getAttribute("aria-disabled") === "true") !== disabled) {
        if(disabled) button.setAttribute("aria-disabled", "true")
        else button.removeAttribute("aria-disabled")
      }
      if(button.getAttribute("aria-label") !== names[action]) {
        button.setAttribute("aria-label", names[action])
        button.title = names[action]
      }
      if(action === "reset" && button.textContent !== text) button.textContent = text
    }
  }
}

/** Removes the buttons the module rendered. */
export function removeControls(root: ShadowRoot): void {
  for(const button of root.querySelectorAll(`[data-ww-viewport-controls] > [data-ww-viewport-action]`)) button.remove()
}

/** The action of the standard button a click landed on, unless the button is marked disabled. */
export function clickedAction(event: Event, root: ShadowRoot): ViewportAction | null {
  const button = (event.target as Element).closest?.("[data-ww-viewport-controls] > [data-ww-viewport-action]")
  if(!button || !root.contains(button) || button.getAttribute("aria-disabled") === "true") return null
  return button.getAttribute("data-ww-viewport-action") as ViewportAction
}
