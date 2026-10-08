/** Import-free, disposable reading controls for ordinary authored documents. */
const blocked = body => !body || body.classList.contains("ww-canvas") || body.classList.contains("ww-slides")
  || document.designMode === "on" || body.children.length === 1
    && (body.firstElementChild.localName.includes("-") || body.firstElementChild.hasAttribute("is"))
    && body.firstElementChild.getAttribute("role")?.toLowerCase().split(/\s+/).includes("document")

const custom = element => element.localName.includes("-") || element.hasAttribute("is")
const activeReaders = new WeakMap()
const figureMedia = element => {
  const media = []
  for(const child of element.children) {
    if(custom(child) || child.localName === "figcaption") continue
    if(child.matches("img, video, audio, iframe, svg, canvas, object, embed")) media.push(child)
    else media.push(...figureMedia(child))
  }
  return media
}

function targets(body) {
  const result = []
  const visit = element => {
    if(custom(element)) return
    if(element.id && /^H[1-6]$/.test(element.tagName)) result.push({element, caption: null, kind: "heading"})
    if(element.tagName === "FIGURE") {
      const media = figureMedia(element)
      if(media.length) result.push({element, caption: element.querySelector(":scope > figcaption"), kind: "figure", media})
    }
    if(element.tagName === "TABLE")
      result.push({element, caption: element.querySelector(":scope > caption"), kind: "table"})
    for(const child of element.children) visit(child)
  }
  for(const child of body.children) visit(child)
  return result
}

/** Mount controls in the body's shadow appendix without changing authored nodes. */
export function mountDocumentReader() {
  const body = document.body
  if(blocked(body)) return null
  if(activeReaders.has(body)) return activeReaders.get(body)
  let appendix
  try { appendix = body.shadowRoot ?? body.attachShadow({mode: "open"}) }
  catch { return null }
  let slot = Array.from(appendix.children).find(element => element.matches("slot:not([name])"))
  if(!slot) { slot = document.createElement("slot"); appendix.prepend(slot) }
  const style = document.createElement("style")
  style.textContent = `
    .◆document-reader-control { display: contents; }
    .◆document-reader-control[hidden], .◆document-reader-control [hidden] { display: none !important; }
    .◆document-reader-control a, .◆document-reader-control button { position: fixed; z-index: 1000; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; padding: 0; border: 0; text-decoration: none; cursor: pointer; opacity: 0; pointer-events: none; }
    .◆document-reader-control a { width: 24px; height: 28px; color: #94a3b8; background: transparent; font: 18px/1 system-ui; }
    .◆document-reader-control button { width: 32px; height: 32px; border-radius: 4px; color: white; background: rgb(15 23 42 / .55); font: 22px/1 system-ui; }
    .◆document-reader-control[data-permalink-visible] a, .◆document-reader-control[data-fullscreen-visible] button,
    .◆document-reader-control a:focus-visible, .◆document-reader-control button:focus-visible { opacity: 1; pointer-events: auto; }
    .◆document-reader-control a:focus-visible, .◆document-reader-control button:focus-visible { outline: 2px solid #2563eb; outline-offset: 1px; }
    .◆document-reader-control a:hover { color: #334155; }
    .◆document-reader-control button:hover { background: rgb(15 23 42 / .75); }
    .◆document-reader-feedback { position: fixed; z-index: 1001; width: max-content; max-width: calc(100vw - 16px); box-sizing: border-box; padding: 5px 8px; border: 1px solid #e2e8f0; border-radius: 4px; background: white; color: #334155; font: 12px/1.4 system-ui; pointer-events: none; }
    .◆document-reader-feedback::after { content: ""; position: absolute; left: calc(var(--arrow-position) - 3px); bottom: -4px; width: 6px; height: 6px; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; background: white; transform: rotate(45deg); }
    .◆document-reader-feedback[data-below]::after { top: -4px; bottom: auto; transform: rotate(225deg); }
    .◆document-reader-feedback[hidden] { display: none; }
    @media print { .◆document-reader-control, .◆document-reader-feedback { display: none !important; } }
  `
  appendix.append(style)
  // Appendix styles cannot reach authored fullscreen content. A disposable
  // document stylesheet supplies presentation without adding authored styles.
  const fullscreenStyles = typeof CSSStyleSheet === "function" && typeof CSSStyleSheet.prototype.replaceSync === "function"
    && "adoptedStyleSheets" in document ? new CSSStyleSheet() : null
  const centerFullscreen = (element = null) => {
    const rect = element?.getBoundingClientRect()
    fullscreenStyles?.replaceSync(`
      figure:fullscreen {
        display: flex; flex-direction: column; justify-content: center; align-items: center;
        box-sizing: border-box; padding: 1rem; gap: .5rem; overflow: auto; background: #000 !important; color: #fff;
      }
      figure:fullscreen > * { flex: 0 1 auto; min-block-size: 0; max-inline-size: 100%; }
      figure:fullscreen :is(img, video, audio, picture, svg, canvas, iframe, object, embed) {
        display: block;
        float: none !important; margin-inline: auto !important;
        max-inline-size: 100%; max-block-size: calc(100dvh - 4rem); object-fit: contain;
      }
      figure:fullscreen > figcaption { flex-shrink: 0; text-align: center; }
      /* Keep native table formatting (including row groups and spans). Padding
       * reserves the surrounding viewport rather than turning rows into flex items. */
      table:fullscreen {
        border-collapse: separate; border-spacing: 0; background: #000 !important; color: #fff;
        padding-inline: max(0px, calc((100vw - ${rect?.width ?? 0}px) / 2));
        padding-block: max(0px, calc((100dvh - ${rect?.height ?? 0}px) / 2));
      }
      :is(figure, table):fullscreen::backdrop { background: #000 !important; }
    `)
  }
  centerFullscreen()
  if(fullscreenStyles) document.adoptedStyleSheets = [...document.adoptedStyleSheets, fullscreenStyles]
  const controls = new Map()
  const feedback = document.createElement("div")
  feedback.className = "◆document-reader-feedback"
  feedback.setAttribute("role", "status")
  feedback.setAttribute("aria-live", "polite")
  feedback.setAttribute("aria-atomic", "true")
  feedback.hidden = true
  appendix.append(feedback)
  let feedbackAnchor = null, feedbackTimer = 0, copyAttempt = 0
  let frame = 0, destroyed = false
  let pointer = null
  const inside = rect => pointer && pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y <= rect.bottom
  const hideFeedback = () => {
    clearTimeout(feedbackTimer)
    feedbackAnchor = null
    feedback.hidden = true
    feedback.textContent = ""
  }
  const positionFeedback = () => {
    if(!feedbackAnchor) return
    if(!feedbackAnchor.isConnected) { hideFeedback(); return }
    const rect = feedbackAnchor.getBoundingClientRect()
    const bubble = feedback.getBoundingClientRect()
    const center = rect.left + rect.width / 2
    const left = Math.max(8, Math.min(center - 14, window.innerWidth - bubble.width - 8))
    const below = rect.top - bubble.height - 8 < 8
    feedback.toggleAttribute("data-below", below)
    feedback.style.left = `${left}px`
    feedback.style.top = `${below ? rect.bottom + 8 : rect.top - bubble.height - 8}px`
    feedback.style.setProperty("--arrow-position", `${Math.max(6, Math.min(bubble.width - 6, center - left))}px`)
  }
  const showFeedback = (anchor, message) => {
    hideFeedback()
    feedbackAnchor = anchor
    feedback.hidden = false
    feedback.textContent = message
    positionFeedback()
    feedbackTimer = setTimeout(hideFeedback, 1800)
  }

  const makeControl = element => {
    const group = document.createElement("div")
    group.className = "◆document-reader-control"
    group.setAttribute("role", "group")
    const kind = element.tagName.toLowerCase()
    group.setAttribute("aria-label", `${kind} controls`)
    let permalink = null
    if(element.id) {
      permalink = document.createElement("a")
      permalink.textContent = "#"
      permalink.title = "Copy link to this section"
      permalink.setAttribute("aria-label", "Copy link to this section")
      permalink.addEventListener("click", async event => {
        // Keep the native href for context menus and modified navigation.
        if(event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        if(destroyed || !element.isConnected || !body.contains(element) || !element.id) return
        const attempt = ++copyAttempt
        const id = element.id
        hideFeedback()
        const url = new URL(document.location.href)
        url.hash = encodeURIComponent(id)
        let message = "Link copied!"
        try {
          if(!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable")
          await navigator.clipboard.writeText(url.href)
        }
        catch { message = "Couldn’t copy link" }
        if(!destroyed && attempt === copyAttempt && group.isConnected && element.isConnected
          && body.contains(element) && element.id === id) showFeedback(permalink, message)
      })
      group.append(permalink)
    }
    if(kind !== "h1" && kind !== "h2" && kind !== "h3" && kind !== "h4" && kind !== "h5" && kind !== "h6") {
      const fullscreen = document.createElement("button")
      fullscreen.type = "button"
      fullscreen.textContent = "⛶"
      fullscreen.title = "View fullscreen"
      fullscreen.setAttribute("aria-label", "View fullscreen")
      fullscreen.addEventListener("click", () => {
        if(!element.isConnected || !body.contains(element)) return
        const api = element.requestFullscreen
        if(!api || !canFullscreen(element)) return
        try {
          if(element.localName === "table") centerFullscreen(element)
          const pending = api.call(element)
          if(pending?.catch) pending.catch(() => {})
        } catch {}
      })
      group.append(fullscreen)
    }
    appendix.append(group)
    return {group, permalink, fullscreen: group.querySelector("button")}
  }
  const update = () => {
    frame = 0
    if(destroyed) return
    const current = targets(body)
    const gutterTarget = current.find(target => target.kind === "heading" && target.element.getBoundingClientRect().width > 0)
      ?? current.find(target => target.element.getBoundingClientRect().width > 0)
    const gutter = gutterTarget?.element.getBoundingClientRect().left
    const wanted = new Set(current.map(item => item.element))
    for(const [element, control] of controls) if(!wanted.has(element) || !element.isConnected) {
      control.group.remove(); controls.delete(element)
    }
    for(const target of current) {
      let control = controls.get(target.element)
      if(!control) { control = makeControl(target.element); controls.set(target.element, control) }
      if(Boolean(control.permalink) !== Boolean(target.element.id)) {
        control.group.remove()
        control = makeControl(target.element)
        controls.set(target.element, control)
      }
      const anchor = target.kind === "table" ? target.caption ?? target.element : target.element
      const targetRect = target.element.getBoundingClientRect()
      const anchorRect = anchor.getBoundingClientRect()
      const rect = anchorRect.width > 0 && anchorRect.height > 0 ? anchorRect : targetRect
      const style = getComputedStyle(anchor)
      const targetStyle = getComputedStyle(target.element)
      const visible = targetStyle.display !== "none" && targetStyle.visibility !== "hidden"
        && targetRect.width > 0 && targetRect.height > 0 && targetRect.right > 0 && targetRect.bottom > 0
        && targetRect.left < window.innerWidth && targetRect.top < window.innerHeight
      control.group.hidden = !visible
      const left = Math.max(0, (gutter ?? targetRect.left) - 30)
      // Include the small gap to the gutter so moving onto # does not hide it.
      const hovered = inside({left: Math.min(left, targetRect.left), right: targetRect.right, top: targetRect.top, bottom: targetRect.bottom})
      control.group.toggleAttribute("data-permalink-visible", Boolean(hovered))
      if(control.permalink) {
        const local = new URL(document.location.href)
        local.hash = encodeURIComponent(target.element.id)
        control.permalink.href = local.href
        control.permalink.hidden = style.display === "none" || style.visibility === "hidden" || rect.bottom <= 0 || rect.top >= window.innerHeight
        const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2 || 28
        control.permalink.style.left = `${left}px`
        control.permalink.style.top = `${target.kind === "figure" ? targetRect.top : rect.top + Math.min(rect.height, lineHeight) / 2 - 14}px`
      }
      if(control.fullscreen) {
        const media = target.media?.find(element => inside(element.getBoundingClientRect()))
          ?? target.media?.find(element => control.fullscreen.matches(":hover, :focus") && element === control.media)
          ?? target.media?.[0] ?? target.element
        const mediaRect = media.getBoundingClientRect()
        const mediaStyle = getComputedStyle(media)
        control.media = media
        control.fullscreen.hidden = !canFullscreen(target.element) || mediaRect.width <= 0 || mediaRect.height <= 0
          || mediaStyle.display === "none" || mediaStyle.visibility === "hidden"
        control.group.toggleAttribute("data-fullscreen-visible", Boolean(inside(mediaRect)))
        control.fullscreen.style.left = `${mediaRect.right - 40}px`
        control.fullscreen.style.top = `${mediaRect.top + 8}px`
      }
      if(!control.permalink && control.fullscreen?.hidden) control.group.hidden = true
    }
    positionFeedback()
  }
  const schedule = () => { if(!frame && !destroyed) frame = requestAnimationFrame(update) }
  const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule)
  const canFullscreen = element => {
    if(typeof element?.requestFullscreen !== "function") return false
    if(document.fullscreenEnabled === false) return false
    const policy = document.permissionsPolicy ?? document.featurePolicy
    try { return !policy?.allowsFeature || policy.allowsFeature("fullscreen") }
    catch { return false }
  }
  const refreshObserved = () => {
    if(!resizeObserver) return
    resizeObserver.disconnect()
    for(const {element, media, caption} of targets(body)) {
      resizeObserver.observe(element)
      if(caption) resizeObserver.observe(caption)
      media?.forEach(element => resizeObserver.observe(element))
    }
  }
  const observer = new MutationObserver(() => {
    if(document.body !== body || blocked(body)) { destroy(); return }
    refreshObserved()
    schedule()
  })
  const onLayout = () => { if(document.body !== body || blocked(body)) destroy(); else schedule() }
  const onPointer = event => {
    if(event.pointerType === "touch") return
    pointer = {x: event.clientX, y: event.clientY}
    schedule()
  }
  const leave = () => { pointer = null; schedule() }
  const onPointerOut = event => { if(!event.relatedTarget) leave() }
  const modeTimer = setInterval(() => { if(document.body !== body || blocked(body)) destroy() }, 250)
  const destroy = () => {
    if(destroyed) return
    destroyed = true
    observer.disconnect()
    resizeObserver?.disconnect()
    window.removeEventListener("resize", onLayout)
    window.removeEventListener("scroll", onLayout, true)
    document.removeEventListener("pointermove", onPointer, true)
    document.removeEventListener("pointerover", onPointer, true)
    document.removeEventListener("pointerout", onPointerOut, true)
    window.removeEventListener("blur", leave)
    clearInterval(modeTimer)
    hideFeedback(); feedback.remove()
    if(fullscreenStyles) document.adoptedStyleSheets = document.adoptedStyleSheets.filter(sheet => sheet !== fullscreenStyles)
    if(activeReaders.get(body) === result) activeReaders.delete(body)
    if(frame) cancelAnimationFrame(frame)
    for(const control of controls.values()) control.group.remove()
    controls.clear(); style.remove()
  }
  observer.observe(document.documentElement, {childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["id", "class", "style", "role", "is"]})
  window.addEventListener("resize", onLayout)
  window.addEventListener("scroll", onLayout, true)
  document.addEventListener("pointermove", onPointer, true)
  document.addEventListener("pointerover", onPointer, true)
  document.addEventListener("pointerout", onPointerOut, true)
  window.addEventListener("blur", leave)
  refreshObserved()
  update()
  const result = {destroy}
  activeReaders.set(body, result)
  return result
}
