/** The runtime class that marks widgets while the document is printed. It is
 * editor state like the runtime `contenteditable`: it never reaches saved
 * HTML, collaboration or history. */
export const printingClass = "ww-beforeprint"

/** Adds `ww-beforeprint` to every widget element while the window prints:
 * between `beforeprint` and `afterprint`, and while the `print` media query
 * matches (headless print-to-PDF fires no `beforeprint`). Widgets added during
 * printing are marked as well. Returns a function that stops and clears. */
export function watchPrinting(view, root, isWidget) {
  const media = view.matchMedia?.("print")
  let printing = false
  const widgets = () => Array.from(root.querySelectorAll("*")).filter(element => isWidget(element))
  const mark = () => widgets().forEach(widget => widget.classList.add(printingClass))
  const clear = () => {
    // The class is reserved: remove it wherever it remains, including widgets
    // that are no longer recognised.
    root.querySelectorAll(`.${printingClass}`).forEach(element => {
      element.classList.remove(printingClass)
      if(!element.classList.length) element.removeAttribute("class")
    })
  }
  const set = value => {
    printing = value
    if(printing) mark()
    else clear()
  }
  const start = () => set(true)
  const end = () => set(false)
  const change = event => set(event.matches)
  const observer = new view.MutationObserver(() => { if(printing) mark() })
  observer.observe(root, {childList: true, subtree: true})
  view.addEventListener("beforeprint", start)
  view.addEventListener("afterprint", end)
  media?.addEventListener?.("change", change)
  if(media?.matches) start()
  return () => {
    view.removeEventListener("beforeprint", start)
    view.removeEventListener("afterprint", end)
    media?.removeEventListener?.("change", change)
    observer.disconnect()
    clear()
  }
}
