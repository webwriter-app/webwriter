import {fixedPopupPosition} from "../src/components/popup-position.ts"

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
  const target = library.selectedOptions[0]?.dataset.href
  if(target) url.pathname = new URL(target, location.href).pathname
  url.searchParams.set("library", library.value)
  location.assign(url)
})

// Static pages have a pre-rendered variant for each library, including old query links.
const requestedLibrary = new URL(location.href).searchParams.get("library")
const requestedOption = [...(library?.options ?? [])].find(option => option.value === requestedLibrary)
if(requestedOption?.dataset.href && requestedOption.value !== library.value) {
  const url = new URL(location.href)
  url.pathname = new URL(requestedOption.dataset.href, location.href).pathname
  location.replace(url)
}

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

const capabilities = document.querySelector(".widget-capabilities")
const guidePreview = capabilities?.querySelector(".widget-capabilities-preview")
if(guidePreview) {
  const core = capabilities.querySelector(".widget-capabilities-core")
  const image = guidePreview.querySelector("img")
  const excerpt = guidePreview.querySelector("p")
  const nativePopover = typeof guidePreview.showPopover === "function"
  const hoverAvailable = matchMedia("(hover: hover)")
  let activeLink, hoveredLink, focusedLink, hideTimer
  let previewHovered = false

  const closePreview = () => {
    clearTimeout(hideTimer)
    if(activeLink && nativePopover) guidePreview.hidePopover()
    guidePreview.hidden = true
    activeLink = undefined
    previewHovered = false
  }

  const positionPreview = () => {
    if(!activeLink) return
    const bounds = activeLink.getBoundingClientRect()
    const {clientWidth: width, clientHeight: height} = document.documentElement
    const pageBounds = capabilities.closest(".page")?.getBoundingClientRect()
    if(bounds.bottom <= Math.max(0, pageBounds?.top ?? 0) || bounds.top >= height) {
      closePreview()
      return
    }
    const popup = guidePreview.getBoundingClientRect()
    const documentBounds = core.getBoundingClientRect()
    // In the three-column map, open toward the document so other links stay reachable.
    const beside = bounds.right <= documentBounds.left ? bounds.right + 4
      : bounds.left >= documentBounds.right ? bounds.left - popup.width - 4
        : undefined
    const {left, top} = beside !== undefined && beside >= 8 && beside + popup.width <= width - 8
      ? {left: beside, top: Math.max(8, Math.min(bounds.top, height - popup.height - 8))}
      : fixedPopupPosition(bounds, popup, {width, height}, 8, 0)
    guidePreview.style.left = `${left}px`
    guidePreview.style.top = `${top}px`
  }

  const showPreview = link => {
    if(!hoverAvailable.matches) return
    clearTimeout(hideTimer)
    if(link === activeLink) return
    image.src = link.querySelector("template").content.querySelector("img").getAttribute("src")
    excerpt.textContent = document.getElementById(link.getAttribute("aria-describedby")).textContent
    activeLink = link
    if(guidePreview.hidden) {
      guidePreview.hidden = false
      if(nativePopover) guidePreview.showPopover()
    }
    positionPreview()
  }

  const scheduleHide = () => {
    clearTimeout(hideTimer)
    if(!activeLink) return
    // Give the pointer time to cross from the link into the preview.
    hideTimer = setTimeout(() => {
      if(previewHovered || activeLink === hoveredLink || activeLink === focusedLink) return
      if(hoveredLink || focusedLink) showPreview(hoveredLink ?? focusedLink)
      else closePreview()
    }, 150)
  }

  capabilities.querySelectorAll("a[aria-describedby]").forEach(link => {
    link.addEventListener("pointermove", event => {
      if(event.pointerType === "touch" || hoveredLink === link) return
      hoveredLink = link
      showPreview(link)
    })
    link.addEventListener("pointerleave", () => {
      if(hoveredLink === link) hoveredLink = undefined
      scheduleHide()
    })
    link.addEventListener("focus", () => {
      focusedLink = link
      showPreview(link)
    })
    link.addEventListener("blur", () => {
      focusedLink = undefined
      scheduleHide()
    })
  })
  guidePreview.addEventListener("pointerenter", () => { previewHovered = true })
  guidePreview.addEventListener("pointerleave", () => {
    previewHovered = false
    scheduleHide()
  })
  document.addEventListener("keydown", event => {
    if(event.key === "Escape" && activeLink) closePreview()
  })
  window.addEventListener("scroll", positionPreview, {capture: true, passive: true})
  window.addEventListener("resize", positionPreview)
  window.addEventListener("pagehide", closePreview)
  hoverAvailable.addEventListener("change", closePreview)
}
