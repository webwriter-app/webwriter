import {fixedPopupPosition} from "../src/components/popup-position.ts"

// Share the sidebar position across documentation pages in this browser tab.
const sidebar = document.querySelector(".documentation-sections")
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

let headingCopyAttempt = 0
let headingCopyTimer, activeHeadingStatus, lastHeadingCopyMessage
document.querySelector("main article")?.addEventListener("click", async event => {
  if(event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
  const link = event.target.closest("a.docs-heading-link")
  const status = link?.previousElementSibling
  if(!status) return
  const attempt = ++headingCopyAttempt
  clearTimeout(headingCopyTimer)
  if(activeHeadingStatus) activeHeadingStatus.textContent = ""
  activeHeadingStatus = status
  // The fragment link handles the URL, scroll, and history as usual.
  let message = "Link copied"
  try { await navigator.clipboard.writeText(link.href) }
  catch { message = "Couldn’t copy link" }
  if(attempt !== headingCopyAttempt) return
  // Keep repeated announcements distinct for screen readers.
  lastHeadingCopyMessage = message === lastHeadingCopyMessage ? `${message}\u00a0` : message
  status.textContent = lastHeadingCopyMessage
  headingCopyTimer = setTimeout(() => { status.textContent = "" }, 2000)
})

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

// Keep the full source in one code block so it can still be copied after expansion.
const samplePreviewLines = 10
const canRevealSearchMatches = "onbeforematch" in HTMLElement.prototype
for(const card of document.querySelectorAll("section.library-note[data-library]")) {
  const [first, ...files] = card.querySelectorAll(":scope > .code-snippet")
  const code = first?.querySelector("pre > code")
  if(!code) continue

  const targets = []
  const id = `library-source-${card.dataset.library}`
  const lines = [...code.querySelectorAll(":scope > .line")]
  const lineCount = lines.length - Number(lines.at(-1)?.textContent === "")
  if(lineCount > samplePreviewLines) {
    const rest = document.createElement("span")
    rest.className = "library-source-rest"
    rest.id = `${id}-rest`
    const nodes = [...code.childNodes]
    rest.append(...nodes.slice(nodes.indexOf(lines[samplePreviewLines - 1]) + 1))
    code.append(rest)
    targets.push(rest)
  }
  if(files.length) {
    const extraFiles = document.createElement("div")
    extraFiles.id = `${id}-files`
    extraFiles.append(...files)
    card.append(extraFiles)
    targets.push(extraFiles)
  }
  if(!targets.length) continue

  const button = document.createElement("button")
  button.type = "button"
  button.className = "library-source-toggle"
  button.setAttribute("aria-controls", targets.map(target => target.id).join(" "))
  const setExpanded = expanded => {
    for(const target of targets) {
      if(expanded) target.removeAttribute("hidden")
      else target.setAttribute("hidden", canRevealSearchMatches ? "until-found" : "")
    }
    button.setAttribute("aria-expanded", String(expanded))
    button.textContent = expanded ? "Show less" : "Show more..."
  }
  button.addEventListener("click", () => {
    const expanded = button.getAttribute("aria-expanded") === "false"
    setExpanded(expanded)
    if(expanded) code.parentElement.focus({preventScroll: true})
    else button.scrollIntoView({block: "nearest"})
  })
  for(const target of targets) target.addEventListener("beforematch", () => setExpanded(true))
  setExpanded(false)
  card.append(button)
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
    const margin = 8
    const spaceAbove = bounds.top - margin
    const spaceBelow = height - bounds.bottom - margin
    // Keep enough room to see the illustration when the card is near the top edge.
    const above = spaceAbove >= 128 || spaceAbove >= spaceBelow
    guidePreview.style.maxBlockSize = `${Math.max(0, above ? spaceAbove : spaceBelow)}px`
    const popup = guidePreview.getBoundingClientRect()
    const {left, top} = fixedPopupPosition(bounds, popup, {width, height}, margin, 0, above ? "above" : "below")
    guidePreview.style.left = `${left}px`
    guidePreview.style.top = `${top}px`
  }

  const showPreview = link => {
    if(!hoverAvailable.matches) return
    clearTimeout(hideTimer)
    if(link === activeLink) return
    const content = link.querySelector("template")?.content.cloneNode(true)
    const image = content?.querySelector("img")
    const description = document.getElementById(link.getAttribute("aria-describedby"))?.cloneNode(true)
    if(!image || !description) return
    description.removeAttribute("id")
    description.removeAttribute("class")
    image.after(description)
    guidePreview.replaceChildren(content)
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
