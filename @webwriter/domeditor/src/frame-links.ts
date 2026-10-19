const frameLinkListeners = new WeakMap<Window, () => void>()

/** Keep links out of document frames, or only external pages out of the site. */
export function openFrameLinksInNewTabs(win: Window & typeof globalThis, {externalPagesOnly = false} = {}) {
  const existing = frameLinkListeners.get(win)
  if(existing) return existing
  const activate = (event: MouseEvent) => {
    if(event.defaultPrevented || (event.type === "click" ? event.button !== 0 : event.button !== 1)) return
    const link = event.composedPath().find((node): node is Element =>
      node instanceof win.Element && node.matches("a[href], area[href], a[xlink\\:href]"))
    if(!link) return
    const href = link.getAttribute("href") ?? link.getAttributeNS("http://www.w3.org/1999/xlink", "href")
    if(href === null) return
    let url: URL
    // srcdoc inherits the parent's base URL, but fragment-only links belong
    // to this frame. Assigning its URL also ignores authored link targets.
    const fragmentOnly = href.trim().startsWith("#")
    try { url = new URL(href, fragmentOnly && !externalPagesOnly ? win.location.href : link.baseURI) }
    catch { if(!externalPagesOnly) event.preventDefault(); return }
    if(externalPagesOnly) {
      if(!["http:", "https:"].includes(url.protocol) || url.origin === win.location.origin || link.hasAttribute("download")) return
      // Let the browser handle activation, including modifier keys and middle clicks.
      link.setAttribute("target", "_blank")
      const rel = new Set((link.getAttribute("rel") ?? "").split(/\s+/).filter(Boolean))
      rel.add("noopener")
      rel.add("noreferrer")
      link.setAttribute("rel", [...rel].join(" "))
      return
    }
    event.preventDefault()
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
