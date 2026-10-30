/** Import-free, disposable reading controls for ordinary authored documents. */
const blocked = body => !body || body.classList.contains("ww-canvas") || body.classList.contains("ww-slides")
  || document.designMode === "on" || body.children.length === 1
    && (body.firstElementChild.localName.includes("-") || body.firstElementChild.hasAttribute("is"))
    && body.firstElementChild.getAttribute("role")?.toLowerCase().split(/\s+/).includes("document")

const custom = element => element.localName.includes("-") || element.hasAttribute("is")
/** Reference metadata is authored CSL data; href alone supplies its identity. */
export function parseReference(value) {
  try {
    const data = JSON.parse(value)
    if(!data || typeof data !== "object" || Array.isArray(data) || typeof data.type !== "string"
      || typeof data.title !== "string" || !data.title.trim()) return null
    const {id, URL, ...reference} = data
    return reference
  } catch { return null }
}

export function collectReferences(body) {
  const references = new Map()
  const key = value => JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]])) : item)
  const visit = element => {
    if(custom(element) || element.namespaceURI !== "http://www.w3.org/1999/xhtml") return
    if(element.localName === "a" && element.hasAttribute("data-reference")) {
      const href = element.getAttribute("href")
      const data = parseReference(element.getAttribute("data-reference"))
      if(href && data) {
        let reference = references.get(href)
        if(!reference) {
          reference = {href, data, anchors: [], conflict: false}
          references.set(href, reference)
        }
        else if(key(reference.data) !== key(data)) reference.conflict = true
        reference.anchors.push(element)
      }
    }
    for(const child of element.children) visit(child)
  }
  for(const child of body.children) visit(child)
  return Array.from(references.values())
}
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
export function mountDocumentReader(licenses = [], appIcon = "", formatReferences = null, translations = {}, anchorFactory = null) {
  const t = (source, values = {}) => (translations[source] ?? source).replace(/\{(\w+)\}/g,
    (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match)
  const body = document.body
  const positioner = anchorFactory?.(document) ?? null
  if(blocked(body)) return null
  if(activeReaders.has(body)) return activeReaders.get(body)
  let appendix
  try { appendix = body.shadowRoot ?? body.attachShadow({mode: "open"}) }
  catch { return null }
  let slot = Array.from(appendix.children).find(element => element.matches("slot:not([name])"))
  if(!slot) { slot = document.createElement("slot"); appendix.prepend(slot) }
  // This runtime is embedded in saved HTML without editor-module imports.
  // Fixed insets exclude the root's symmetric scrollbar gutters; client
  // rectangles include them. Measure once per update for all reader controls.
  const fixedGutterOffset = () => {
    const root = document.documentElement
    return root.clientWidth && getComputedStyle(root).scrollbarGutter?.includes("both-edges")
      ? Math.max(0, window.innerWidth - root.clientWidth) : 0
  }
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
    .◆document-reader-feedback::after { content: ""; position: absolute; left: calc(var(--arrow-position, 50%) - 3px); bottom: -4px; width: 6px; height: 6px; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; background: white; transform: rotate(45deg); }
    .◆document-reader-feedback[data-below]::after { top: -4px; bottom: auto; transform: rotate(225deg); }
    .◆document-reader-feedback[hidden] { display: none; }
    .◆document-pane { position: fixed; right: 20px; bottom: 20px; z-index: 1000; display: flex; align-items: center; justify-content: flex-end; gap: 8px; overflow: visible; color: #94a3b8; font: 12px/1.5 system-ui; text-align: right; }
    .◆document-pane[hidden] { display: none; }
    .◆document-pane a { color: inherit; }
    .◆document-pane .◆document-brand { display: inline-flex; flex: none; align-items: center; justify-content: center; width: 24px; height: 28px; }
    .◆document-brand img { width: 18px; height: 22px; object-fit: contain; filter: grayscale(1); opacity: .5; }
    .◆document-brand:hover img { filter: none; opacity: 1; }
    .◆document-pane-actions { display: flex; flex: none; gap: 4px; }
    .◆document-pane button { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 28px; height: 28px; padding: 0; border: 0; background: transparent; color: inherit; cursor: pointer; font: inherit; }
    .◆document-pane button:hover { color: #334155; }
    .◆document-pane button:disabled { opacity: .5; cursor: wait; }
    .◆document-pane button.◆document-copyright { display: block; flex: 0 1 auto; min-width: 0; width: auto; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .◆document-pane [hidden] { display: none !important; }
    .◆document-pane :is(a, button):focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
    .◆document-reuse { position: absolute; bottom: calc(100% + 8px); left: 0; width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 4px; background: white; color: #334155; text-align: left; overflow: visible; }
    .◆document-reuse::after { content: ""; position: absolute; bottom: -4px; left: calc(var(--reuse-arrow, 50%) - 3px); width: 6px; height: 6px; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; background: white; transform: rotate(45deg); }
    .◆document-reuse > div { max-height: calc(100dvh - 130px); overflow: auto; }
    .◆document-reuse p { margin: 6px 0; }
    .◆document-reuse a { text-decoration: underline; }
    .◆document-reuse header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .◆document-reuse button { width: 20px; height: 20px; }
    .◆document-references { position: fixed; z-index: 1001; inset: auto 20px 60px auto; width: min(440px, calc(100vw - 40px)); max-height: calc(100dvh - 100px); overflow: auto; box-sizing: border-box; padding: 16px; border: 1px solid #e2e8f0; border-radius: 4px; background: white; color: #334155; font: 12px/1.5 system-ui; text-align: left; }
    .◆document-references[hidden] { display: none !important; }
    .◆document-references header, .◆document-references footer { display: flex; align-items: center; gap: 8px; }
    .◆document-references header strong { flex: 1; }
    .◆document-references button, .◆document-references select { width: auto; padding: 4px; font: inherit; }
    .◆document-references li { margin-block: 12px; overflow-wrap: anywhere; }
    .◆document-references p { margin-block: 4px; }
    .◆document-references pre { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; }
    @media print { .◆document-reader-control, .◆document-reader-feedback, .◆document-pane, .◆document-references { display: none !important; } }
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
  const pane = document.createElement("aside")
  pane.className = "◆document-pane"
  pane.setAttribute("aria-label", t("Document information and actions"))
  pane.hidden = true
  const brand = document.createElement("a")
  brand.className = "◆document-brand"
  brand.href = "https://edumix.eu"; brand.target = "_blank"; brand.rel = "noopener noreferrer"
  brand.title = t("WebWriter on edumix.eu"); brand.setAttribute("aria-label", brand.title)
  const brandImage = document.createElement("img")
  brandImage.alt = "WebWriter"; brandImage.src = appIcon
  brand.append(brandImage)
  const metadata = document.createElement("button")
  metadata.type = "button"; metadata.className = "◆document-copyright"
  metadata.setAttribute("aria-label", t("How to reuse this document"))
  metadata.setAttribute("aria-expanded", "false")
  const reuse = document.createElement("div")
  reuse.className = "◆document-reuse"; reuse.hidden = true; reuse.tabIndex = -1
  reuse.setAttribute("role", "dialog"); reuse.setAttribute("aria-label", t("Reuse this document"))
  const reuseHeader = document.createElement("header")
  const reuseTitle = document.createElement("strong"); reuseTitle.textContent = t("Reuse this document")
  const closeReuseButton = document.createElement("button")
  closeReuseButton.type = "button"; closeReuseButton.textContent = "×"; closeReuseButton.setAttribute("aria-label", t("Close reuse information"))
  const reuseContent = document.createElement("div")
  reuseHeader.append(reuseTitle, closeReuseButton); reuse.append(reuseHeader, reuseContent)
  const closeReuse = (restoreFocus = false) => {
    reuse.hidden = true; metadata.setAttribute("aria-expanded", "false")
    if(restoreFocus) metadata.focus()
  }
  closeReuseButton.addEventListener("click", () => closeReuse(true))
  metadata.addEventListener("click", () => {
    if(!reuse.hidden) { closeReuse(); return }
    reuse.hidden = false; metadata.setAttribute("aria-expanded", "true")
    const rect = metadata.getBoundingClientRect()
    reuse.style.setProperty("--reuse-arrow", `${rect.left + rect.width / 2 - pane.getBoundingClientRect().left}px`)
    reuse.focus()
  })
  pane.addEventListener("focusout", event => {
    if(!reuse.contains(event.relatedTarget) && event.relatedTarget !== metadata) closeReuse()
  })
  pane.addEventListener("keydown", event => { if(event.key === "Escape" && !reuse.hidden) { event.preventDefault(); closeReuse(true) } })
  const actions = document.createElement("div")
  actions.className = "◆document-pane-actions"
  actions.setAttribute("role", "group")
  actions.setAttribute("aria-label", t("Document actions"))
  pane.append(brand, metadata, actions, reuse)
  appendix.append(pane)
  const downloadURLs = new Map()
  let fileHandle = null, saving = false
  const save = async () => {
    if(destroyed || document.body !== body || saving) return
    // Preview delegates to the editor's canonical serializer and retained handle.
    if(!window.dispatchEvent(new Event("webwriter-document-save", {cancelable: true}))) return
    saving = true; saveButton.disabled = true
    const name = document.title.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-") || "document"
    const filename = /\.html?$/i.test(name) ? name : `${name}.html`
    try {
      if(!fileHandle && typeof window.showSaveFilePicker === "function") {
        try {
          fileHandle = await window.showSaveFilePicker({suggestedName: filename,
            types: [{description: t("HTML document"), accept: {"text/html": [".html", ".htm"]}}]})
        } catch(error) {
          if(error?.name === "AbortError") return
          // Unsupported contexts and denied access can still download a copy.
        }
      }
      if(destroyed || document.body !== body) return
      const serializer = new XMLSerializer()
      const source = Array.from(document.childNodes).map(node => node.nodeType === 1 ? node.outerHTML : serializer.serializeToString(node)).join("")
      const blob = new Blob([source], {type: "text/html;charset=utf-8"})
      if(fileHandle) {
        let writable
        try {
          writable = await fileHandle.createWritable()
          await writable.write(blob)
          await writable.close()
          return
        } catch {
          try { await writable?.abort() } catch {}
          fileHandle = null
        }
      }
      if(destroyed || document.body !== body) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url; link.download = filename; link.click()
      downloadURLs.set(url, setTimeout(() => { URL.revokeObjectURL(url); downloadURLs.delete(url) }, 0))
    } catch { if(!destroyed) showFeedback(saveButton, t("Couldn’t save document")) }
    finally { saving = false; saveButton.disabled = false }
  }
  const iconButton = (name, label, path, handler) => {
    const button = document.createElement("button")
    button.type = "button"; button.name = name; button.title = label
    button.setAttribute("aria-label", label)
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    icon.setAttribute("viewBox", "0 0 24 24"); icon.setAttribute("width", "18"); icon.setAttribute("height", "18")
    icon.setAttribute("fill", "none"); icon.setAttribute("stroke", "currentColor"); icon.setAttribute("stroke-width", "1.5")
    icon.setAttribute("stroke-linecap", "round"); icon.setAttribute("stroke-linejoin", "round"); icon.setAttribute("aria-hidden", "true")
    const shape = document.createElementNS(icon.namespaceURI, "path")
    shape.setAttribute("d", path); icon.append(shape); button.append(icon)
    button.addEventListener("click", () => { if(!destroyed && document.body === body) handler() })
    actions.append(button)
    return button
  }
  const saveButton = iconButton("save", t("Save document"), "M5 3h12l4 4v14H3V3zM7 3v6h10V3M7 21v-8h10v8", save)
  iconButton("print", t("Print document"), "M6 9V3h12v6M6 18H4V9h16v9h-2M6 15h12v6H6zM17 12h.01", () => window.print())
  const referencesPanel = document.createElement("div")
  referencesPanel.className = "◆document-references"; referencesPanel.hidden = true; referencesPanel.tabIndex = -1
  referencesPanel.setAttribute("role", "dialog"); referencesPanel.setAttribute("aria-label", t("References"))
  const referencesHeader = document.createElement("header")
  const referencesTitle = document.createElement("strong"); referencesTitle.textContent = t("References")
  const referencesClose = document.createElement("button")
  referencesClose.type = "button"; referencesClose.textContent = "×"; referencesClose.setAttribute("aria-label", t("Close references"))
  referencesHeader.append(referencesTitle, referencesClose)
  const referencesList = document.createElement("ol")
  const referencesPreview = document.createElement("pre")
  referencesPreview.setAttribute("aria-label", t("Formatted bibliography"))
  const referencesFooter = document.createElement("footer")
  const referencesStyle = document.createElement("select")
  referencesStyle.setAttribute("aria-label", t("Citation style"))
  for(const name of ["apa", "vancouver", "harvard1"]) {
    const option = document.createElement("option"); option.value = name
    option.textContent = {apa: "APA", vancouver: "Vancouver", harvard1: "Harvard"}[name]
    referencesStyle.append(option)
  }
  const referenceStatus = document.createElement("p"); referenceStatus.setAttribute("role", "status")
  let references = [], referenceKey = ""
  const closeReferences = (restoreFocus = false) => {
    referencesPanel.hidden = true; referencesButton.setAttribute("aria-expanded", "false")
    if(restoreFocus) referencesButton.focus()
  }
  const updateReferences = () => {
    references = collectReferences(body)
    referencesButton.hidden = !references.length
    if(!references.length) closeReferences()
    const nextKey = JSON.stringify(references.map(({href, data, conflict}) => [href, data, conflict])) + referencesStyle.value
    if(nextKey === referenceKey) return
    referenceKey = nextKey
    referencesList.replaceChildren(); referenceStatus.textContent = ""
    for(const reference of references) {
      const item = document.createElement("li"); item.setAttribute("data-reference-href", reference.href)
      const title = document.createElement("p"); title.textContent = reference.data.title
      item.append(title)
      if(reference.conflict) {
        const warning = document.createElement("p"); warning.textContent = t("Conflicting metadata for this reference. Resolve it in the editor before copying."); item.append(warning)
      }
      const jump = document.createElement("button"); jump.type = "button"; jump.textContent = t("Go to citation")
      jump.addEventListener("click", () => {
        const current = collectReferences(body).find(entry => entry.href === reference.href)?.anchors[0]
        if(current?.isConnected) { closeReferences(); current.scrollIntoView?.({block: "center"}); current.focus() }
      })
      item.append(jump); referencesList.append(item)
    }
    const unavailable = !formatReferences || references.some(reference => reference.conflict)
    referencesPreview.textContent = ""
    if(!unavailable) try { referencesPreview.textContent = formatReferences(references, "bibliography", referencesStyle.value) }
    catch { referenceStatus.textContent = t("Couldn’t format this reference.") }
    copyReferences.disabled = unavailable; copyBibtex.disabled = unavailable
  }
  const openReferences = href => {
    updateReferences(); closeReuse()
    if(!references.length) return
    referencesPanel.hidden = false; referencesButton.setAttribute("aria-expanded", "true"); referencesPanel.focus()
    if(href) Array.from(referencesList.children).find(item => item.getAttribute("data-reference-href") === href)?.scrollIntoView?.({block: "nearest"})
  }
  const referencesButton = iconButton("references", t("References"), "M4 3h6v18H4zM14 3h6v18h-6zM4 7h6M14 7h6", () => {
    if(referencesPanel.hidden) openReferences(); else closeReferences()
  })
  referencesButton.setAttribute("aria-expanded", "false")
  const copy = async format => {
    try {
      updateReferences()
      if(!formatReferences || references.some(reference => reference.conflict) || !references.length) return
      const output = formatReferences(references, format, referencesStyle.value)
      if(!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable")
      await navigator.clipboard.writeText(output)
      if(!destroyed) referenceStatus.textContent = t("Copied references")
    } catch { if(!destroyed) referenceStatus.textContent = t("Couldn’t copy references") }
  }
  const copyReferences = document.createElement("button"), copyBibtex = document.createElement("button")
  copyReferences.type = copyBibtex.type = "button"
  copyReferences.name = "copy-references"; copyReferences.textContent = t("Copy references")
  copyBibtex.name = "copy-bibtex"; copyBibtex.textContent = t("Copy BibTeX")
  copyReferences.addEventListener("click", () => copy("bibliography"))
  copyBibtex.addEventListener("click", () => copy("bibtex"))
  referencesFooter.append(referencesStyle, copyReferences, copyBibtex)
  referencesPanel.append(referencesHeader, referencesList, referencesPreview, referencesFooter, referenceStatus); appendix.append(referencesPanel)
  referencesClose.addEventListener("click", () => closeReferences(true))
  referencesStyle.addEventListener("change", updateReferences)
  referencesPanel.addEventListener("keydown", event => { if(event.key === "Escape") { event.preventDefault(); closeReferences(true) } })
  const onReferenceClick = event => {
    if(event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = event.target instanceof Element ? event.target.closest("a[data-reference]") : null
    const href = anchor?.getAttribute("href")
    if(!href?.startsWith("#") || !collectReferences(body).some(reference => reference.anchors.includes(anchor))) return
    event.preventDefault(); openReferences(href)
  }
  body.addEventListener("click", onReferenceClick)
  let metadataKey = ""
  const updatePane = offset => {
    const author = document.head.querySelector('meta[name="author" i]')?.getAttribute("content")?.trim() ?? ""
    const license = document.head.querySelector('link[rel~="license" i]')
    const href = license?.getAttribute("href")?.trim() ?? ""
    const title = license?.getAttribute("title")?.trim() ?? ""
    const year = new Date().getFullYear()
    const key = JSON.stringify([author, href, title, year])
    if(metadataKey !== key) {
      metadataKey = key
      closeReuse()
      const known = licenses.find(item => item.url.replace(/\/$/, "") === href.replace(/\/$/, ""))
      const label = known?.code.replace(/-\d+(?:\.\d+)?$/, "") || title || (href ? t("License") : "")
      metadata.textContent = [author && `© ${author} ${year}`, label].filter(Boolean).join(", ")
      metadata.title = metadata.textContent
      metadata.hidden = !author && !href
      reuseContent.replaceChildren()
      const paragraph = text => { const p = document.createElement("p"); p.textContent = text; reuseContent.append(p) }
      if(known) {
        const code = known.code
        if(code.startsWith("CC0-")) paragraph(t("You may copy, edit and share this document, including commercially, without requesting permission. Credit is appreciated."))
        else {
          paragraph(t("You may copy and share this document{commercial}. {editing}", {
            commercial: code.includes("-NC") ? t(" for noncommercial purposes") : t(", including commercially"),
            editing: code.includes("-ND") ? t("You may edit it privately, but cannot distribute modified versions.") : t("You may also edit and adapt it."),
          }))
          paragraph(t("Credit {creator}, retain supplied notices, link to the document and license, and indicate changes. Do not imply endorsement.", {creator: author || t("the creator")}))
          if(code.includes("-SA")) paragraph(t("Share adaptations under the same or a compatible license."))
          paragraph(t("Do not add legal or technical restrictions that prevent others from exercising the license permissions."))
        }
        paragraph(t("This is a summary. Check the full terms and any separately credited material before reuse."))
      } else paragraph(href ? t("Review the linked license for permission and conditions before copying, editing or sharing this document.") : t("No reuse license is specified. Ask {holder} for permission unless your use is otherwise permitted.", {holder: author || t("the copyright holder")}))
      if(href) try {
        const url = new URL(href, document.baseURI)
        if(["http:", "https:"].includes(url.protocol)) {
          const link = document.createElement("a")
          link.textContent = known?.name || title || t("Read license terms"); link.href = url.href
          link.target = "_blank"; link.rel = "noopener noreferrer"; reuseContent.append(link)
        }
      } catch {}
    }
    // Only content alongside the bottom row constrains its width. Wide content
    // elsewhere leaves the bottom area available, even with a narrow side gutter.
    let right = 0
    const alongsidePane = rect => rect.bottom > window.innerHeight - 68 && rect.top < window.innerHeight - 20
    const measure = element => {
      if(element.matches("script, style, link, meta, template")) return
      const rect = element.getBoundingClientRect()
      const css = getComputedStyle(element)
      if(css.display === "none" || css.visibility === "hidden") return
      const content = custom(element) || element.matches("p, h1, h2, h3, h4, h5, h6, figure, table, pre, blockquote, ul, ol, dl, form, fieldset, hr, svg, canvas, img, picture, audio, video, iframe, object, embed, input, textarea, select, button")
        || Array.from(element.childNodes).some(node => node.nodeType === 3 && node.textContent.trim())
        || css.backgroundColor && !["transparent", "rgba(0, 0, 0, 0)"].includes(css.backgroundColor)
        || parseFloat(css.borderLeftWidth) > 0 || parseFloat(css.borderRightWidth) > 0
      if(content && rect.width > 0 && rect.height > 0) {
        if(alongsidePane(rect)) right = Math.max(right, rect.right)
      }
      for(const child of element.children) if(!custom(element)) measure(child)
    }
    for(const element of body.children) measure(element)
    for(const node of body.childNodes) {
      if(node.nodeType !== 3 || !node.textContent.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      if(typeof range.getClientRects === "function") {
        for(const rect of range.getClientRects()) {
          if(alongsidePane(rect)) right = Math.max(right, rect.right)
        }
      }
    }
    const page = body.getBoundingClientRect()
    const pageStyle = getComputedStyle(body)
    const pageRight = page.width > 0 ? page.right - (parseFloat(pageStyle.paddingRight) || 0) - (parseFloat(pageStyle.borderRightWidth) || 0) : window.innerWidth - 20
    const edge = Math.min(window.innerWidth - 20, pageRight)
    const width = Math.min(360, edge - right - 20)
    pane.style.right = `${window.innerWidth - edge - offset}px`
    pane.style.width = `${Math.max(0, width)}px`
    pane.hidden = width < 116 || Boolean(document.fullscreenElement)
    if(pane.hidden) closeReuse()
    if(!reuse.hidden) {
      const rect = metadata.getBoundingClientRect()
      reuse.style.setProperty("--reuse-arrow", `${rect.left + rect.width / 2 - pane.getBoundingClientRect().left}px`)
    }
  }
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
    positioner?.release(feedback)
    feedbackAnchor = null
    feedback.hidden = true
    feedback.textContent = ""
  }
  const positionFeedback = (offset = fixedGutterOffset()) => {
    if(!feedbackAnchor) return
    if(!feedbackAnchor.isConnected) { hideFeedback(); return }
    if(positioner) {
      positioner.bind(feedback, feedbackAnchor,
        "position-area:top center;position-try-fallbacks:flip-block;position-visibility:anchors-visible;")
      positioner.refresh()
      // The native placement owns the bubble; only its speech-arrow inset
      // needs the rendered relationship between bubble and link.
      const anchor = feedbackAnchor
      requestAnimationFrame(() => {
        if(feedbackAnchor !== anchor || feedback.hidden || destroyed) return
        const rect = anchor.getBoundingClientRect(), bubble = feedback.getBoundingClientRect()
        feedback.toggleAttribute("data-below", bubble.top >= rect.bottom)
        feedback.style.setProperty("--arrow-position", `${Math.max(6, Math.min(bubble.width - 6, rect.left + rect.width / 2 - bubble.left))}px`)
      })
      return
    }
    const rect = feedbackAnchor.getBoundingClientRect()
    const bubble = feedback.getBoundingClientRect()
    const center = rect.left + rect.width / 2
    const left = Math.max(8, Math.min(center - 14, window.innerWidth - bubble.width - 8))
    const below = rect.top - bubble.height - 8 < 8
    feedback.toggleAttribute("data-below", below)
    feedback.style.left = `${left - offset}px`
    feedback.style.top = `${below ? rect.bottom + 8 : rect.top - bubble.height - 8}px`
    feedback.style.setProperty("--arrow-position", `${Math.max(6, Math.min(bubble.width - 6, center - left))}px`)
  }
  const showFeedback = (anchor, message) => {
    hideFeedback()
    feedbackAnchor = anchor
    // Positioned anchors precede the positioned box that references them.
    appendix.append(feedback)
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
    const kindLabel = t(kind)
    group.setAttribute("aria-label", t("{kind} controls", {kind: kindLabel}))
    let permalink = null
    if(element.id) {
      permalink = document.createElement("a")
      permalink.textContent = "#"
      permalink.title = t("Copy link to this section")
      permalink.setAttribute("aria-label", permalink.title)
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
        let message = t("Link copied!")
        try {
          if(!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable")
          await navigator.clipboard.writeText(url.href)
        }
        catch { message = t("Couldn’t copy link") }
        if(!destroyed && attempt === copyAttempt && group.isConnected && element.isConnected
          && body.contains(element) && element.id === id) showFeedback(permalink, message)
      })
      group.append(permalink)
    }
    if(kind !== "h1" && kind !== "h2" && kind !== "h3" && kind !== "h4" && kind !== "h5" && kind !== "h6") {
      const fullscreen = document.createElement("button")
      fullscreen.type = "button"
      fullscreen.textContent = "⛶"
      fullscreen.title = t("View fullscreen")
      fullscreen.setAttribute("aria-label", fullscreen.title)
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
    const offset = fixedGutterOffset()
    updateReferences()
    const current = targets(body)
    const gutterTarget = current.find(target => target.kind === "heading" && target.element.getBoundingClientRect().width > 0)
      ?? current.find(target => target.element.getBoundingClientRect().width > 0)
    const gutter = gutterTarget?.element.getBoundingClientRect().left
    const wanted = new Set(current.map(item => item.element))
    for(const [element, control] of controls) if(!wanted.has(element) || !element.isConnected) {
      if(control.permalink) positioner?.release(control.permalink)
      if(control.fullscreen) positioner?.release(control.fullscreen)
      control.group.remove(); controls.delete(element)
    }
    for(const target of current) {
      let control = controls.get(target.element)
      if(!control) { control = makeControl(target.element); controls.set(target.element, control) }
      if(Boolean(control.permalink) !== Boolean(target.element.id)) {
        if(control.permalink) positioner?.release(control.permalink)
        if(control.fullscreen) positioner?.release(control.fullscreen)
        control.group.remove()
        control = makeControl(target.element)
        controls.set(target.element, control)
      }
      const anchor = target.caption ?? target.element
      const targetRect = target.element.getBoundingClientRect()
      const anchorRect = anchor.getBoundingClientRect()
      const hasAnchorRect = anchorRect.width > 0 && anchorRect.height > 0
      const rect = hasAnchorRect ? anchorRect : targetRect
      const positionAnchor = hasAnchorRect ? anchor : target.element
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
        const captionInset = target.caption ? (parseFloat(style.paddingTop) || 0) + (parseFloat(style.borderTopWidth) || 0) : 0
        const captionBottomInset = target.caption ? (parseFloat(style.paddingBottom) || 0) + (parseFloat(style.borderBottomWidth) || 0) : 0
        const firstLineHeight = Math.min(Math.max(0, rect.height - captionInset - captionBottomInset), lineHeight)
        if(positioner) {
          control.permalink.style.setProperty("--reader-gutter-left", `${Math.max(0, (gutter ?? targetRect.left)) - offset}px`)
          control.permalink.style.setProperty("--reader-caption-offset", `${target.kind === "figure" && !target.caption ? 0 : captionInset + firstLineHeight / 2 - 14}px`)
          positioner.bind(control.permalink, positionAnchor,
            "left:calc(var(--reader-gutter-left) - 30px);top:calc(anchor(top) + var(--reader-caption-offset));position-visibility:anchors-visible;")
        }
        else {
          control.permalink.style.left = `${left - offset}px`
          control.permalink.style.top = `${target.kind === "figure" && !target.caption ? targetRect.top : rect.top + captionInset + firstLineHeight / 2 - 14}px`
        }
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
        if(positioner) {
          positioner.bind(control.fullscreen, media,
            "left:calc(anchor(right) - 40px);top:calc(anchor(top) + 8px);position-visibility:anchors-visible;")
        }
        else {
          control.fullscreen.style.left = `${mediaRect.right - 40 - offset}px`
          control.fullscreen.style.top = `${mediaRect.top + 8}px`
        }
      }
      if(!control.permalink && control.fullscreen?.hidden) control.group.hidden = true
    }
    positionFeedback(offset)
    // The trailing scrollbar reduces the fixed containing block even when
    // no matching leading gutter is reserved.
    const rootWidth = document.documentElement.clientWidth
    updatePane(rootWidth ? Math.max(0, window.innerWidth - rootWidth) : 0)
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
    const observe = element => {
      if(element.matches("script, style, link, meta, template")) return
      resizeObserver.observe(element)
      if(!custom(element)) for(const child of element.children) observe(child)
    }
    observe(body)
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
  const onBlur = () => { leave(); closeReuse() }
  const onPointerOut = event => { if(!event.relatedTarget) leave() }
  const modeTimer = setInterval(() => { if(document.body !== body || blocked(body)) destroy() }, 250)
  const destroy = () => {
    if(destroyed) return
    destroyed = true
    observer.disconnect()
    body.removeEventListener("click", onReferenceClick)
    resizeObserver?.disconnect()
    window.removeEventListener("resize", onLayout)
    window.removeEventListener("scroll", onLayout, true)
    document.removeEventListener("fullscreenchange", onLayout)
    document.removeEventListener("pointermove", onPointer, true)
    document.removeEventListener("pointerover", onPointer, true)
    document.removeEventListener("pointerout", onPointerOut, true)
    window.removeEventListener("blur", onBlur)
    clearInterval(modeTimer)
    hideFeedback(); feedback.remove()
    pane.remove()
    referencesPanel.remove()
    for(const [url, timer] of downloadURLs) { clearTimeout(timer); URL.revokeObjectURL(url) }
    downloadURLs.clear()
    fileHandle = null
    if(fullscreenStyles) document.adoptedStyleSheets = document.adoptedStyleSheets.filter(sheet => sheet !== fullscreenStyles)
    if(activeReaders.get(body) === result) activeReaders.delete(body)
    if(frame) cancelAnimationFrame(frame)
    for(const control of controls.values()) control.group.remove()
    positioner?.destroy()
    controls.clear(); style.remove()
  }
  observer.observe(document.documentElement, {childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["id", "class", "style", "role", "is", "name", "content", "rel", "href", "title", "data-reference", "data-reference-locator"]})
  window.addEventListener("resize", onLayout)
  window.addEventListener("scroll", onLayout, true)
  document.addEventListener("fullscreenchange", onLayout)
  document.addEventListener("pointermove", onPointer, true)
  document.addEventListener("pointerover", onPointer, true)
  document.addEventListener("pointerout", onPointerOut, true)
  window.addEventListener("blur", onBlur)
  refreshObserved()
  update()
  const result = {destroy}
  activeReaders.set(body, result)
  return result
}
