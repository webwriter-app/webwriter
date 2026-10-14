// Share the sidebar position across documentation pages in this browser tab.
const sidebar = document.querySelector("aside")
const sidebarScrollKey = "webwriter-docs-sidebar-scroll"
if(sidebar) {
  try {
    const position = Number(sessionStorage.getItem(sidebarScrollKey))
    if(Number.isFinite(position) && position >= 0) sidebar.scrollTop = position
  }
  catch { /* Navigation still works when browser storage is unavailable. */ }
  sidebar.addEventListener("scroll", () => {
    if(!sidebar.clientHeight) return // The desktop sidebar is hidden on narrow screens.
    try { sessionStorage.setItem(sidebarScrollKey, String(sidebar.scrollTop)) }
    catch { /* Browser storage may be disabled. */ }
  }, {passive: true})
}

const library = document.querySelector('select[name="library"]')
library?.addEventListener("change", () => {
  const url = new URL(location.href)
  url.searchParams.set("library", library.value)
  location.assign(url)
})

// Keep same-origin examples fitted to their content, including narrow layouts.
document.querySelectorAll("article iframe").forEach(frame => {
  let observer
  const resize = () => {
    const body = frame.contentDocument?.body
    if(!body) return
    const style = getComputedStyle(body)
    const height = Math.ceil(body.getBoundingClientRect().height
      + parseFloat(style.marginTop) + parseFloat(style.marginBottom))
    frame.height = String(height + frame.offsetHeight - frame.clientHeight)
  }
  const observe = () => {
    observer?.disconnect()
    try {
      const body = frame.contentDocument?.body
      if(!body) return
      observer = new ResizeObserver(resize)
      observer.observe(body)
      resize()
    }
    catch { /* Cross-origin embeds retain their authored dimensions. */ }
  }
  frame.addEventListener("load", observe)
  if(frame.contentDocument?.readyState === "complete" && frame.contentDocument.URL !== "about:blank") observe()
  window.addEventListener("pagehide", () => observer?.disconnect(), {once: true})
})
