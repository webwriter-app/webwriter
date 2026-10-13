const frameLinkListeners = new WeakMap<Window, () => void>()

/** Keep external links out of the frame while navigating local fragments in it. */
export function openFrameLinksInNewTabs(win: Window & typeof globalThis) {
  const existing = frameLinkListeners.get(win)
  if(existing) return existing
  const activate = (event: MouseEvent) => {
    if(event.defaultPrevented || (event.type === "click" ? event.button !== 0 : event.button !== 1)) return
    const link = event.composedPath().find((node): node is Element =>
      node instanceof win.Element && node.matches("a[href], area[href], a[xlink\\:href]"))
    if(!link) return
    const href = link.getAttribute("href") ?? link.getAttributeNS("http://www.w3.org/1999/xlink", "href")
    if(href === null) return
    event.preventDefault()
    let url: URL
    // srcdoc inherits the parent's base URL, but fragment-only links belong
    // to this frame. Assigning its URL also ignores authored link targets.
    const fragmentOnly = href.trim().startsWith("#")
    try { url = new URL(href, fragmentOnly ? win.location.href : link.baseURI) } catch { return }
    if(fragmentOnly || href.includes("#") && url.href.split("#")[0] === win.location.href.split("#")[0]) {
      win.location.assign(url.href)
      return
    }
    if(["javascript:", "data:"].includes(url.protocol)) return
    win.open(url.href, "_blank", "noopener,noreferrer")
  }
  // Bubble after document handlers so references and widget controls can consume clicks.
  win.addEventListener("click", activate)
  win.addEventListener("auxclick", activate)
  const disconnect = () => {
    win.removeEventListener("click", activate)
    win.removeEventListener("auxclick", activate)
    frameLinkListeners.delete(win)
  }
  frameLinkListeners.set(win, disconnect)
  return disconnect
}
