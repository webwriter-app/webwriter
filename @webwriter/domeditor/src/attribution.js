/** Authored metadata, shared by editing, collaboration and standalone readers. */
export const attributionAttributes = {
  name: "data-ww-attribution-name",
  year: "data-ww-attribution-year",
  license: "data-ww-license",
  contact: "data-ww-attribution-contact",
  type: "data-ww-attribution-type",
}

/** Import-free so the same appendix UI can be embedded in saved HTML. */
export function createAttributionController(doc, options = {}) {
  const view = doc.defaultView
  const anchors = options.anchorFactory?.(doc)
  const body = doc.body
  const fields = Object.keys(attributionAttributes)
  const selector = Object.values(attributionAttributes).map(name => `[${name}]`).join(",")
  const licenses = options.licenses ?? []
  const editable = () => options.editable?.() === true
  const values = element => Object.fromEntries(fields.map(key => [key, element.getAttribute(attributionAttributes[key]) ?? ""]))
  const creditText = data => [data.type === "copyright" ? "©" : "", data.year, data.name].filter(Boolean).join(" ")
  const hasCredit = data => fields.some(key => key !== "type" && data[key].trim())
  const authored = element => element?.nodeType === 1 && element !== body && body.contains(element)
    && !element.matches("script, style, link, meta, template, slot")
  const atomicTarget = element => {
    if(options.resolveElement) return options.resolveElement(element)
    let target = element
    for(let parent = element; parent && parent !== body; parent = parent.parentElement) {
      if(parent.parentElement === body && body.children.length === 1
        && parent.getAttribute("role")?.toLowerCase().split(/\s+/).includes("document")) continue
      if(parent.localName.includes("-") || parent.hasAttribute("is")) target = parent
    }
    return target
  }
  const eligible = element => {
    if(!authored(element)) return null
    const candidate = editable() ? atomicTarget(element) : element.closest(selector)
    return authored(candidate) && options.canAttribute?.(candidate) !== false ? candidate : null
  }
  const contactURL = value => {
    if(!value || /\s/.test(value)) return null
    const source = /^[^@:/]+@[^@/]+\.[^@/]+$/.test(value) ? `mailto:${value}` : value
    try {
      const url = new URL(source)
      return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null
    } catch { return null }
  }
  const licenseDetails = value => {
    const license = licenses.find(license => [license.code, license.name, license.url].includes(value))
    const text = license?.code ?? value
    const code = text.match(/^[a-z0-9][a-z0-9.+-]*$/i)?.[0]
    return {text, href: code ? `https://spdx.org/licenses/${encodeURIComponent(code)}.html` : null}
  }
  const root = doc.createElement("div")
  root.className = "◆attribution-ui"
  root.contentEditable = "false"
  root.innerHTML = `<style>
    .◆attribution-ui { display: contents; color: #334155; font: 13px/1.4 system-ui, sans-serif; }
    .◆attribution-ui [hidden], .copyright[hidden], .copyright svg[hidden] { display: none !important; }
    .◆attribution-ui .bridge { position: fixed; z-index: 1002; width: max(16px, var(--ww-page-gutter, 1rem)); height: 16px; pointer-events: auto; }
    .◆attribution-ui button, .◆attribution-ui input { box-sizing: border-box; font: inherit; }
    .◆attribution-ui .copyright:not(.empty-attribution) { display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; margin-inline: auto; padding: 0; border: 0; border-radius: 3px; background: #fff; color: #64748b; cursor: pointer; }
    .◆attribution-ui .copyright svg { width: 12px; height: 12px; }
    .◆attribution-ui button:hover { background: #f1f5f9; color: #0f172a; }
    .◆attribution-ui :focus-visible { outline: 2px solid #2563eb; outline-offset: 1px; }
    .◆attribution-ui .popup { position: fixed; inset: auto; margin: 0; box-sizing: border-box; width: 280px; max-width: calc(100vw - 16px); max-height: calc(100dvh - 16px); overflow: auto; padding: 12px; border: 1px solid #cbd5e1; border-radius: 6px; box-shadow: 0 4px 20px rgb(0 0 0 / 16%); background: #fff; color: #334155; font: 13px/1.4 system-ui, sans-serif; z-index: 1003; pointer-events: auto; user-select: text; -webkit-user-select: text; }
    .◆attribution-ui .heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
    .◆attribution-ui .credit-types { display: flex; min-width: 0; border: 1px solid #cbd5e1; border-radius: 3px; overflow: hidden; }
    .◆attribution-ui .credit-types button { padding: 5px 8px; border: 0; background: #f8fafc; color: inherit; cursor: pointer; }
    .◆attribution-ui .credit-types button + button { border-left: 1px solid #cbd5e1; }
    .◆attribution-ui .credit-types button[aria-pressed=true] { background: #e8f2fd; color: #1e4f87; }
    .◆attribution-ui .credit-types button:focus-visible { outline-offset: -2px; }
    .◆attribution-ui .close { width: 24px; height: 24px; border: 0; border-radius: 3px; padding: 0; background: transparent; color: inherit; cursor: pointer; font-size: 18px; }
    .◆attribution-ui form { display: grid; gap: 10px; margin: 0; }
    .◆attribution-ui label { display: grid; gap: 4px; }
    .◆attribution-ui input { caret-color: auto; width: 100%; min-width: 0; height: 30px; padding: 4px 7px; border: 1px solid #cbd5e1; border-radius: 3px; color: #0f172a; background: #fff; }
    .◆attribution-ui .pair { display: grid; grid-template-columns: minmax(0, 1fr) 70px; gap: 8px; }
    .◆attribution-ui .actions { display: flex; justify-content: space-between; gap: 10px; }
    .◆attribution-ui .actions button { padding: 5px 12px; border: 1px solid #cbd5e1; border-radius: 3px; background: #f8fafc; color: inherit; cursor: pointer; }
    .◆attribution-ui .actions .delete { color: #b42318; }
    .◆attribution-ui .selection-summary { margin: 0; color: #64748b; }
    .◆attribution-ui .details { display: grid; gap: 8px; overflow-wrap: anywhere; }
    .◆attribution-ui a { color: inherit; text-decoration: underline; }
    .◆attribution-ui .error { margin: 0; color: #b91c1c; }
    .◆attribution-ui .attribution-note { display: block; position: absolute; width: max-content; height: max-content; max-width: none; max-height: none; overflow: visible; margin: 0; padding: 0; color: #777; background: transparent; font: 6pt/6pt system-ui, sans-serif; writing-mode: sideways-lr; direction: ltr; white-space: nowrap; pointer-events: auto; user-select: none; -webkit-user-select: none; }
    .◆attribution-ui .attribution-group { display: contents; }
    .◆attribution-ui .attribution-group:hover .attribution-note { color: #000; }
    .◆attribution-ui .attribution-note.left-attribution { writing-mode: sideways-rl; text-align: right; transform: translateX(-100%); }
    .◆attribution-ui .attribution-note.horizontal-attribution { writing-mode: horizontal-tb; text-align: right; transform: none; white-space: normal; }
    .◆attribution-ui .horizontal-attribution .attribution-text { height: auto; }
    .◆attribution-ui .attribution-note > span { display: block; }
    .◆attribution-ui .attribution-text, .◆attribution-ui .attribution-contact { width: max-content; height: max-content; }
    .◆attribution-ui .attribution-note .wrapped { white-space: normal; overflow-wrap: anywhere; }
    .◆attribution-ui .attribution-note.compact-attribution { writing-mode: horizontal-tb; font-size: 9pt; line-height: 1; }
    .◆attribution-ui .attribution-link { color: inherit; text-decoration: underline; }
    .◆attribution-ui .attribution-note[role=button], .◆attribution-ui .attribution-note[role=button] * { cursor: pointer; }
    .◆attribution-ui .attribution-footnotes, .◆attribution-ui .attribution-reference { display: none; }
    @media print {
      .◆attribution-ui { display: contents; }
      .◆attribution-ui .bridge, .◆attribution-ui .popup { display: none !important; }
      .◆attribution-ui .attribution-symbol { display: none; }
      .◆attribution-ui .attribution-reference { display: flex; align-items: center; justify-content: center; box-sizing: border-box; width: 14pt; height: 14pt; border: .5pt solid currentColor; border-radius: 50%; background: #fff; white-space: nowrap; font-variant-numeric: tabular-nums; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .◆attribution-ui .attribution-note.compact-attribution { font-size: 7pt; transform: translateX(-50%); z-index: 2147483647; }
      .◆attribution-ui .attribution-footnotes:not(:empty) { display: block; clear: both; margin-block: 1rem 0; padding-top: 6pt; border-top: .5pt solid #aaa; color: #777; font: 8pt/1.4 system-ui, sans-serif; overflow-wrap: anywhere; }
      .◆attribution-ui .attribution-footnotes ol { margin: 0; padding-inline-start: 1.5em; }
      .◆attribution-ui .attribution-footnotes li { break-inside: avoid; margin-block: 0 4pt; }
      .◆attribution-ui.non-document-layout .attribution-note { display: none; }
    }
  </style><div class="bridge" hidden><button class="copyright" type="button" aria-label="Copyright and attribution" title="Copyright and attribution" aria-haspopup="dialog" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M15 9a4 4 0 1 0 0 6"/></svg></button></div>
  <div class="popup" popover="auto" role="dialog" aria-label="Copyright and attribution" hidden>
    <div class="heading"><div class="credit-types" role="group" aria-label="Copyright or attribution"><button type="button" value="copyright" aria-pressed="false">Copyright</button><button type="button" value="attribution" aria-pressed="true">Attribution</button></div><button class="close" type="button" aria-label="Close">×</button></div>
    <form><input name="type" type="hidden"><div class="pair"><label>Name<input name="name" autocomplete="name"></label><label>Year<input name="year" inputmode="numeric" pattern="[0-9]{4}" placeholder="YYYY"></label></div>
    <label>License<input name="license" type="hidden"></label>
    <label>Contact URL or email<input name="contact" placeholder="https://… or name@example.com"></label>
    <p class="selection-summary" hidden></p><p class="error" role="alert" hidden></p><div class="actions"><button class="delete" type="button" aria-label="Delete attribution">Delete</button><button class="save" type="button">Save</button></div></form><div class="details" hidden></div>
  </div>`
  const bridge = root.querySelector(".bridge"), button = root.querySelector(".copyright")
  const popup = root.querySelector(".popup"), form = root.querySelector("form"), details = root.querySelector(".details")
  const footnotes = doc.createElement("section")
  footnotes.className = "attribution-footnotes"
  footnotes.setAttribute("aria-label", "Attributions")
  root.append(footnotes)
  const error = root.querySelector(".error")
  const inputs = Object.fromEntries(fields.map(key => [key, form.elements.namedItem(key)]))
  const typeButtons = Array.from(root.querySelectorAll(".credit-types button"))
  const updateType = () => {
    for(const control of typeButtons) {
      control.setAttribute("aria-pressed", String(control.value === (inputs.type.value === "copyright" ? "copyright" : "attribution")))
      control.disabled = !editable()
    }
  }
  for(const control of typeButtons) control.addEventListener("click", () => {
    if(!editable()) return
    inputs.type.value = control.value
    updateType()
  })
  const licensePicker = options.createLicensePicker?.(inputs.license)
  if(licensePicker) inputs.license.after(licensePicker)
  // Constructed sheets also work under the editing frame's nonce-only CSP.
  const style = root.querySelector("style")
  const sheet = new view.CSSStyleSheet()
  sheet.replaceSync(style.textContent)
  style.remove()
  if(options.append) options.append(root)
  else {
    const appendix = body.shadowRoot ?? body.attachShadow({mode: "open"})
    if(!Array.from(appendix.children).some(element => element.matches("slot:not([name])"))) appendix.prepend(doc.createElement("slot"))
    appendix.append(root)
  }
  const appendix = root.getRootNode()
  appendix.adoptedStyleSheets = [...appendix.adoptedStyleSheets, sheet]
  let target = null, opened = null, baseline = null
  let openedElements = [], baselines = new Map()
  let frame, queued = false, destroyed = false
  let noteSheet = null, noteRules = "", noteSequence = 0, notesDirty = true
  const notes = new Map()
  const noteResize = view.ResizeObserver ? new view.ResizeObserver(() => { notesDirty = true; schedule() }) : null
  const removeNote = (element, record) => {
    noteResize?.unobserve(element)
    element.classList.remove(record.marker)
    if(!record.hadClass && !element.classList.length) element.removeAttribute("class")
    record.group.remove()
    record.contactLabel?.remove()
    notes.delete(element)
  }
  const clearNotes = () => {
    footnotes.replaceChildren()
    for(const [element, record] of notes) removeNote(element, record)
    if(noteSheet) doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter(sheet => sheet !== noteSheet)
    noteSheet = null; noteRules = ""
  }
  const bindNote = (label, element) => {
    const activate = event => {
      if(event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return
      if(event.type === "auxclick" && event.button !== 1) return
      event.preventDefault()
      open(element)
    }
    label.addEventListener("click", activate)
    label.addEventListener("auxclick", activate)
    label.addEventListener("keydown", activate)
  }
  const syncNotes = () => {
    const template = body.children.length === 1 && body.firstElementChild.getAttribute("role")?.toLowerCase().split(/\s+/).includes("document")
      && (body.firstElementChild.localName.includes("-") || body.firstElementChild.hasAttribute("is"))
    root.classList.toggle("non-document-layout", !template && ["ww-canvas", "ww-slides", "ww-board"].filter(name => body.classList.contains(name)).length === 1)
    const bodyStyle = view.getComputedStyle(body)
    const singleRightGutter = !root.classList.contains("non-document-layout")
      && bodyStyle.getPropertyValue("--ww-responsive-float").trim() === "right"
      && parseFloat(bodyStyle.paddingRight) > parseFloat(bodyStyle.paddingLeft) + 1
    const current = new Set()
    const footnoteList = doc.createElement("ol")
    footnotes.replaceChildren()
    for(const element of body.querySelectorAll(selector)) {
      const data = values(element)
      if(!authored(element) || options.canAttribute?.(element) === false || !hasCredit(data)) continue
      if(element.hasAttribute("hidden") || (element.checkVisibility ? !element.checkVisibility({visibilityProperty: true}) : view.getComputedStyle(element).display === "none")) continue
      current.add(element)
      let record = notes.get(element)
      if(!record) {
        const index = noteSequence++
        const name = `--ww-attribution-${index}`
        const marker = `◆attribution-${index}`
        const part = `attribution-note-${index}`
        const label = doc.createElement("div")
        const group = doc.createElement("div")
        group.className = "attribution-group"
        group.append(label)
        label.className = "attribution-note"
        label.setAttribute("part", part)
        record = {marker, name, part, label, group, signature: "", hadClass: element.hasAttribute("class"), anchor: view.getComputedStyle(element).anchorName}
        notes.set(element, record)
        noteResize?.observe(element)
        bindNote(label, element)
        root.append(group)
      }
      if(!element.classList.contains(record.marker)) {
        record.hadClass = element.hasAttribute("class")
        element.classList.add(record.marker)
      }
      // Follow responsive float placement, and keep column labels out of a
      // shared right gutter without flipping labels belonging to its floats.
      const float = view.getComputedStyle(element).float || "none"
      let inFloat = float !== "none"
      if(singleRightGutter && !inFloat) {
        for(let parent = element.parentElement; parent && parent !== body; parent = parent.parentElement) {
          const side = view.getComputedStyle(parent).float
          if(side && side !== "none") { inFloat = true; break }
        }
      }
      const left = float === "left" || singleRightGutter && !inFloat
      record.label.classList.toggle("left-attribution", left)
      record.label.classList.remove("horizontal-attribution", "compact-attribution")
      record.label.querySelector(".attribution-summary")?.remove()
      for(const child of record.label.children) child.hidden = false
      const signature = JSON.stringify([data, editable()])
      const label = record.label
      if(record.signature !== signature) {
        record.signature = signature
        label.replaceChildren()
        record.contactLabel?.remove()
        record.contactLabel?.replaceChildren()
        const first = doc.createElement("span")
        first.className = "attribution-text"
        first.textContent = creditText(data)
        const license = licenseDetails(data.license)
        const appendText = (parent, text, href = null) => {
          const node = doc.createElement(href && !editable() ? "a" : "span")
          node.textContent = text
          if(href) node.className = "attribution-link"
          if(node.localName === "a") { node.href = href; node.target = "_blank"; node.rel = "noopener noreferrer" }
          parent.append(node)
        }
        if(data.license) {
          if(first.textContent) first.append(" ")
          appendText(first, license.text, license.href)
        }
        if(first.textContent) label.append(first)
        if(data.contact) {
          const second = doc.createElement("span")
          second.className = "attribution-contact"
          appendText(second, data.contact.replace(/^mailto:/i, ""), contactURL(data.contact))
          label.append(second)
        }
      }
      const first = label.querySelector(".attribution-text")
      const contact = label.querySelector(".attribution-contact") ?? record.contactLabel?.querySelector(".attribution-contact")
      if(contact) { contact.hidden = false; label.append(contact) }
      const box = element.getBoundingClientRect()
      const resetPart = node => {
        node.classList.remove("wrapped")
        node.style.removeProperty("height")
        node.style.removeProperty("width")
      }
      const fitsVertical = node => {
        resetPart(node)
        if(node.getBoundingClientRect().height <= box.height) return true
        if(box.height <= 0) return false
        node.classList.add("wrapped")
        node.style.height = `${box.height}px`
        return node.getBoundingClientRect().width <= 2 * parseFloat(view.getComputedStyle(node).lineHeight) + .1
      }
      // Each part gets at most two lines within the element's edge. Credits
      // that cannot fit use a compact trigger; their complete data stays intact.
      let wrapped = false, compact = false
      let horizontal = false, below = false, annotationSpace = 0
      if(first) {
        resetPart(first)
        wrapped = first.getBoundingClientRect().height > box.height
        horizontal = wrapped && float !== "none"
        if(horizontal) {
          label.classList.add("horizontal-attribution")
          first.classList.add("wrapped")
          first.style.width = `${box.width}px`
          compact = first.getBoundingClientRect().height > 2 * parseFloat(view.getComputedStyle(first).lineHeight) + .1
          const caption = element.querySelector(":scope > :is(figcaption, caption)")
          below = Boolean(caption && !caption.hasAttribute("hidden") && view.getComputedStyle(caption).display !== "none"
            && (caption.localName === "caption" ? view.getComputedStyle(caption).captionSide !== "bottom" : caption === element.firstElementChild))
          annotationSpace = Math.ceil(first.getBoundingClientRect().height + 2)
        }
        else compact = !fitsVertical(first)
      }
      if(contact && !horizontal) {
        resetPart(contact)
        wrapped = wrapped || contact.getBoundingClientRect().height > box.height
      }
      if(contact && wrapped) {
        if(!record.contactLabel) {
          const secondary = doc.createElement("div")
          secondary.className = "attribution-note attribution-contact-note"
          secondary.setAttribute("part", `${record.part}-contact`)
          bindNote(secondary, element)
          record.contactLabel = secondary
        }
        record.contactLabel.classList.toggle("left-attribution", horizontal ? left : !left)
        if(contact.parentElement !== record.contactLabel) record.contactLabel.replaceChildren(contact)
        if(!record.contactLabel.isConnected) record.group.append(record.contactLabel)
      }
      else {
        if(contact && contact.parentElement !== label) label.append(contact)
        record.contactLabel?.remove()
      }
      if(contact) compact = !fitsVertical(contact) || compact
      if(compact) {
        for(const child of label.children) child.hidden = true
        const summary = doc.createElement("span")
        summary.className = "attribution-summary"
        const symbol = doc.createElement("span")
        symbol.className = "attribution-symbol"
        symbol.textContent = data.type === "copyright" ? "©" : "ⓘ"
        summary.append(symbol)
        if(!root.classList.contains("non-document-layout")) {
          const item = doc.createElement("li")
          renderDetails(item, element, true)
          footnoteList.append(item)
          const reference = doc.createElement("span")
          reference.className = "attribution-reference"
          reference.textContent = String(footnoteList.children.length)
          summary.append(reference)
        }
        label.append(summary)
        label.classList.remove("horizontal-attribution")
        label.classList.add("compact-attribution")
        record.contactLabel?.remove()
        horizontal = false
      }
      for(const node of [label, record.contactLabel].filter(Boolean)) {
        node.tabIndex = 0
        node.setAttribute("role", "button")
        node.setAttribute("aria-haspopup", "dialog")
        node.setAttribute("aria-label", `${editable() ? "Edit" : "Show"} attribution: ${[first?.textContent, contact?.textContent].filter(Boolean).join(" ")}`)
      }
      const {marker, name, part, anchor} = record
      const position = (part, left) => `body::part(${part}) { position-anchor: ${name}; bottom: anchor(bottom); left: anchor(${left ? "left" : "right"}); }`
      const horizontalPosition = `body::part(${part}) { position-anchor: ${name}; left: auto; right: anchor(right); width: anchor-size(width); ${below ? "top: calc(anchor(bottom) + 2px); bottom: auto;" : "bottom: calc(anchor(top) + 2px); top: auto;"} }`
      record.before = horizontal && !below ? annotationSpace : 0
      record.rules = `.${view.CSS.escape(marker)} { anchor-name: ${anchor && anchor !== "none" ? `${anchor}, ` : ""}${name} !important; --ww-attribution-after: ${horizontal && below ? annotationSpace : 0}px; }\n${horizontal ? horizontalPosition : position(part, left)}${wrapped && contact && !compact ? `\n${position(`${part}-contact`, horizontal ? left : !left)}` : ""}`
    }
    if(footnoteList.children.length) footnotes.append(footnoteList)
    for(const [element, record] of notes) if(!current.has(element)) removeNote(element, record)
    if(!notes.size) { clearNotes(); return }
    // Share the clearance after floats so credits above one float cannot
    // shift it below an opposing float whose credit sits underneath.
    const before = Math.max(0, ...Array.from(notes.values(), record => record.before))
    const rules = `body { --ww-float-attribution-before: ${before}px; }\n${Array.from(notes.values(), record => record.rules).join("\n")}`
    if(!noteSheet) {
      noteSheet = new view.CSSStyleSheet()
      doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, noteSheet]
    }
    if(noteRules !== rules) { noteSheet.replaceSync(rules); noteRules = rules }
  }
  const preparePrint = () => {
    notesDirty = false
    try { syncNotes() }
    catch(error) { clearNotes(); throw error }
  }
  const resize = view.ResizeObserver ? new view.ResizeObserver(() => schedule()) : null
  const close = (focus = false) => {
    if(!opened) return
    const previous = opened
    opened = null; baseline = null; openedElements = []; baselines.clear()
    licensePicker?.close(true)
    popup.hidePopover?.()
    popup.hidden = true
    button.setAttribute("aria-expanded", "false")
    if(focus) (notes.get(previous)?.label ?? button).focus({preventScroll: true})
    refresh()
  }
  const renderDetails = (container = details, element = opened, inline = false) => {
    container.replaceChildren()
    const data = values(element)
    const credit = doc.createElement(inline ? "span" : "div")
    credit.textContent = creditText(data)
    if(credit.textContent) container.append(credit)
    const add = (text, href) => {
      if(!text) return
      const node = doc.createElement(href && !editable() ? "a" : inline ? "span" : "div")
      node.textContent = text
      if(href) node.className = "attribution-link"
      if(node.localName === "a") { node.href = href; node.target = "_blank"; node.rel = "noopener noreferrer" }
      if(inline && container.childNodes.length) container.append(" ")
      container.append(node)
    }
    const license = licenseDetails(data.license)
    add(license.text, license.href)
    add(data.contact.replace(/^mailto:/i, ""), contactURL(data.contact))
  }
  const refresh = () => {
    if(destroyed) return
    if(observer.takeRecords().length) notesDirty = true
    if(notesDirty) {
      notesDirty = false
      try { syncNotes() }
      catch(error) { clearNotes(); throw error }
    }
    if(openedElements.some(element => eligible(element) !== element)) close()
    const next = opened ?? eligible(options.selectedElement?.())
    if(next !== target) {
      resize?.disconnect()
      target = next
      if(target) resize?.observe(target)
    }
    const empty = Boolean(target && options.selectedElement) && !hasCredit(values(target))
    bridge.hidden = !empty
    const container = empty ? options.affordanceContainer?.(target) : null
    const parent = container ?? bridge
    if(button.parentElement !== parent) parent.append(button)
    button.hidden = !target
    if(!target) { anchors?.release(bridge); anchors?.release(popup); return }
    button.classList.toggle("empty-attribution", empty)
    const placement = container?.matches('[part~="transform-overlay-board"]') ? " transform-overlay-attribution-board"
      : container ? " transform-overlay-attribution-freeform" : ""
    button.setAttribute("part", empty ? `transform-overlay-button transform-overlay-attribution${placement}` : "")
    bridge.setAttribute("part", empty ? "transform-overlay" : "")
    button.querySelector("svg").toggleAttribute("hidden", empty || values(target).type !== "copyright")
    // Paint with the normal controls, above the native drag hit regions.
    if(empty && !opened && appendix.lastElementChild !== root) appendix.append(root)
    if(anchors) {
      const size = empty ? 20 : 16
      const width = empty ? "20px" : "max(16px,var(--ww-page-gutter,1rem))"
      const html = doc.documentElement
      const gutter = view.navigator.userAgent.includes("Firefox") && view.getComputedStyle(html).scrollbarGutter?.includes("both-edges")
        ? Math.max(0, view.innerWidth - html.clientWidth) / 2 : 0
      if(container) anchors.release(bridge)
      else anchors.bind(bridge, target, `left:clamp(0px,calc(anchor(right) - ${(empty ? size / 2 : 0) + gutter}px),calc(100vw - ${width}));top:clamp(0px,calc(anchor(center) - ${size / 2}px),calc(100dvh - ${size}px));width:${width};height:${size}px;position-visibility:anchors-visible;`)
      if(opened) {
        if(!editable()) { form.hidden = true; details.hidden = false; renderDetails() }
        anchors.bind(popup, container || empty ? button : notes.get(target)?.label ?? target, "inset:auto;position-area:bottom span-right;justify-self:start;align-self:start;margin:4px 0;position-try-fallbacks:flip-block,flip-inline,flip-block flip-inline,--ww-ui-popup-below,--ww-ui-popup-above;position-visibility:anchors-visible;")
      }
      else anchors.release(popup)
      anchors.refresh()
      return
    }
    const rect = target.getBoundingClientRect()
    const style = view.getComputedStyle(target)
    bridge.hidden = bridge.hidden || !rect.width || !rect.height || style.visibility === "hidden" || style.display === "none"
      || rect.bottom <= 0 || rect.top >= view.innerHeight
    button.hidden = bridge.hidden
    if(container) bridge.hidden = true
    const html = doc.documentElement
    const offset = html.clientWidth && view.getComputedStyle(html).scrollbarGutter?.includes("both-edges")
      ? Math.max(0, view.innerWidth - html.clientWidth) : 0
    const size = empty ? 20 : 16
    // Use the layout gutter itself as the hover bridge, with equal space on
    // either side of the saved-attribution button.
    if(empty) bridge.style.width = `${size}px`
    else bridge.style.removeProperty("width")
    const gutter = empty ? size : bridge.getBoundingClientRect().width || size
    // Center the editing affordance on the right edge, below the delete control.
    const left = Math.max(offset, Math.min(rect.right - (empty ? size / 2 : 0), view.innerWidth - gutter - offset))
    const top = Math.max(0, Math.min(view.innerHeight - size, (rect.top + rect.bottom) / 2 - size / 2))
    bridge.style.left = `${Math.max(0, left - offset)}px`
    bridge.style.top = `${top}px`
    // Touch the right edge so reading hover reaches the button without a gap.
    bridge.style.height = `${size}px`
    if(opened) {
      if(!editable()) { form.hidden = true; details.hidden = false; renderDetails() }
      const box = popup.getBoundingClientRect()
      const control = container ? button.getBoundingClientRect() : {left, top, bottom: top + size}
      popup.style.left = `${Math.max(8, Math.min(control.left - offset, view.innerWidth - box.width - 8 - offset))}px`
      popup.style.top = `${control.bottom + 4 + box.height <= view.innerHeight - 8 ? control.bottom + 4 : Math.max(8, control.top - box.height - 4)}px`
    }
  }
  const schedule = () => {
    if(anchors) {
      if(queued || destroyed) return
      queued = true
      view.queueMicrotask(() => { queued = false; if(!destroyed) refresh() })
      return
    }
    if(frame || destroyed) return
    frame = view.requestAnimationFrame(() => { frame = undefined; refresh() })
  }
  const open = element => {
    const elements = [...new Set((Array.isArray(element) ? element : [element]).map(eligible))]
    if(!elements.length || elements.includes(null)) return false
    openedElements = elements
    opened = elements[0]
    baselines = new Map(elements.map(element => [element, values(element)]))
    baseline = Object.fromEntries(fields.map(key => [key, elements.every(element => baselines.get(element)[key] === baselines.get(opened)[key]) ? baselines.get(opened)[key] : ""]))
    const summary = root.querySelector(".selection-summary")
    summary.hidden = elements.length === 1
    summary.textContent = `Applies to ${elements.length} elements. Only changed fields are saved.`
    form.hidden = !editable(); details.hidden = editable(); error.hidden = true
    for(const key of fields) { inputs[key].value = baseline[key]; inputs[key].setCustomValidity("") }
    updateType()
    if(licensePicker) licensePicker.value = baseline.license
    if(!editable()) renderDetails()
    popup.hidden = false
    popup.showPopover?.()
    button.setAttribute("aria-expanded", "true")
    refresh()
    if(editable()) inputs.name.focus({preventScroll: true})
    else root.querySelector(".close").focus({preventScroll: true})
    return true
  }
  button.addEventListener("pointerdown", event => event.preventDefault())
  button.addEventListener("click", () => opened ? close(true) : open(target))
  root.querySelector(".close").addEventListener("click", () => close(true))
  popup.addEventListener("toggle", event => { if(event.newState === "closed") close() })
  root.addEventListener("keydown", event => {
    if(event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true) }
    if(event.key === "Tab" && opened && editable() && !event.defaultPrevented && event.composedPath().includes(popup)) {
      const controls = [inputs.name, inputs.year, licensePicker, inputs.contact, root.querySelector(".delete"), root.querySelector(".save"), ...typeButtons, root.querySelector(".close")]
        .filter(control => control?.isConnected && !control.disabled)
      const index = controls.findIndex(control => event.composedPath().includes(control))
      event.preventDefault()
      event.stopPropagation()
      licensePicker?.close()
      controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus({preventScroll: true})
    }
  })
  inputs.contact.addEventListener("input", () => inputs.contact.setCustomValidity(""))
  const save = (remove = false) => {
    if(!editable() || !opened || openedElements.some(element => eligible(element) !== element)) { close(); return }
    const changed = {}
    for(const key of fields) {
      if(!remove && inputs[key].value === baseline[key]) continue
      const value = remove ? "" : inputs[key].value.trim()
      if(!remove && value === baseline[key]) continue
      if(openedElements.some(element => (element.getAttribute(attributionAttributes[key]) ?? "") !== baselines.get(element)[key])) {
        error.textContent = "Attribution changed while editing. Close and reopen to use the latest values."
        error.hidden = false
        return
      }
      changed[key] = value
    }
    if(changed.contact) {
      const url = contactURL(changed.contact)
      inputs.contact.setCustomValidity(url ? "" : "Enter an http(s) website URL or an email address.")
      if(!url) { inputs.contact.reportValidity(); return }
      changed.contact = url
    }
    if(!remove && !form.reportValidity()) return
    if(!Object.keys(changed).length || options.save?.(openedElements, changed)) close(true)
  }
  // Native form activation is suppressed by designMode in some browsers.
  root.querySelector(".save").addEventListener("click", () => save())
  root.querySelector(".delete").addEventListener("click", () => save(true))
  form.addEventListener("submit", event => { event.preventDefault(); save() })
  form.addEventListener("keydown", event => {
    if(event.key === "Enter" && !event.isComposing && !event.defaultPrevented) {
      event.preventDefault()
      save(event.target === root.querySelector(".delete"))
    }
  })
  const handleEvent = event => {
    const path = event.composedPath()
    if(path.includes(root) || path.includes(button)) return
    if(event.type === "pointerdown") close()
    else if(event.type === "selectionchange") refresh()
    else schedule()
  }
  const observer = new view.MutationObserver(() => { notesDirty = true; schedule() })
  observer.observe(body, {attributes: true, childList: true, subtree: true, characterData: true})
  const layoutChanged = () => { notesDirty = true; schedule() }
  view.addEventListener("resize", layoutChanged)
  const afterPrint = () => { notesDirty = true; schedule() }
  view.addEventListener("beforeprint", preparePrint)
  view.addEventListener("afterprint", afterPrint)
  if(!anchors) doc.addEventListener("scroll", schedule, true)
  refresh()
  return {element: root, handleEvent, refresh, open, destroy() {
    destroyed = true
    if(frame) view.cancelAnimationFrame(frame)
    observer.disconnect(); resize?.disconnect(); noteResize?.disconnect()
    clearNotes()
    view.removeEventListener("beforeprint", preparePrint)
    view.removeEventListener("afterprint", afterPrint)
    view.removeEventListener("resize", layoutChanged)
    doc.removeEventListener("scroll", schedule, true)
    anchors?.destroy()
    popup.hidePopover?.()
    appendix.adoptedStyleSheets = appendix.adoptedStyleSheets.filter(current => current !== sheet)
    root.remove()
    button.remove()
  }}
}

export function mountAttributionReader(licenses = [], anchorFactory) {
  if(!document.body || document.designMode === "on") return null
  const controller = createAttributionController(document, {licenses, anchorFactory})
  const types = ["pointerdown"]
  types.forEach(type => document.addEventListener(type, controller.handleEvent))
  const destroy = controller.destroy
  controller.destroy = () => {
    types.forEach(type => document.removeEventListener(type, controller.handleEvent))
    window.removeEventListener("pagehide", controller.destroy)
    destroy()
  }
  window.addEventListener("pagehide", controller.destroy, {once: true})
  return controller
}
