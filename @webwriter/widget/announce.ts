import {adoptStyles} from "./styles.js"

/** What `announcer()` returns. */
export type Announcer = {
  /** Speaks `text` politely: it does not interrupt what is being read. */
  announce(text: string): void
  /** Ends this use. The region is removed when its last user released it. Safe to call twice. */
  release(): void
}

type Region = {element: HTMLElement; users: number; removeStyles: () => void}

const regions = new WeakMap<ShadowRoot, Region>()

// Visually hidden, but read. The widget's own rules must not show it.
const styles = `[data-ww-live] { position: absolute !important; width: 1px !important; height: 1px !important; margin: 0 !important; padding: 0 !important; border: 0 !important; overflow: hidden !important; clip-path: inset(50%) !important; white-space: nowrap !important; }`

/**
 * The polite live region of a widget's shadow root, shared by every module in
 * it, so that a widget never speaks through two regions at once. In a core:
 *
 *     onConnect() {
 *         const live = announcer(this.root)
 *         this.cleanup(live.release)
 *         this.#announce = live.announce
 *     }
 *
 * The region is an empty `<div data-ww-live aria-live="polite">` at the end of
 * the shadow root. It exists from the first `announcer()` call, because a
 * region that appears together with its text is often not read.
 */
export function announcer(root: ShadowRoot): Announcer {
  let region = regions.get(root)
  if(!region) {
    const element = root.ownerDocument.createElement("div")
    element.setAttribute("data-ww-live", "")
    element.setAttribute("aria-live", "polite")
    element.setAttribute("aria-atomic", "true")
    region = {element, users: 0, removeStyles: adoptStyles(root, styles)}
    regions.set(root, region)
  }
  const {element} = region
  const shared = region
  shared.users++
  let released = false
  const place = () => {
    // A framework may clear what a module added to the shadow root.
    if(element.parentNode !== root) root.append(element)
  }
  place()
  return {
    announce(text) {
      if(released) return
      place()
      // The same text twice in a row is no change and would not be read again.
      element.textContent = text !== "" && text === element.textContent ? `${text} ` : text
    },
    release() {
      if(released) return
      released = true
      if(--shared.users > 0) return
      element.remove()
      shared.removeStyles()
      regions.delete(root)
    },
  }
}
