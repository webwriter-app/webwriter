import {css, html, nothing} from "lit"
import {StyleCombobox} from "./style-combobox"
import type {ComboboxOption} from "./editor-combobox"
import {fontFamilyOptions} from "../marks"
import {bunnyFonts, bunnyFontStylesheet, bunnyFontValue, fontFamilies, type BunnyFont} from "../fonts"
import {connectPopup} from "./popup-position"
import {connectedComboboxStyles} from "./dropdown-content.styles"
import {readFontFiles, saveFontFile, type FontFileHandle, type StoredFontFile} from "../local-font-storage"
import {cssFontString, embedFontFiles, type DeviceFont, type EmbeddedFont, type FontAccessWindow} from "../local-fonts"
import {ribbonIcon} from "../ribbon-icons"

type LocalFontOption = ComboboxOption & {source: "installed" | "imported", devices?: DeviceFont[], record?: StoredFontFile}
const isLocalOption = (option: ComboboxOption): option is LocalFontOption => "source" in option

const standardFontOptions: readonly ComboboxOption[] = fontFamilyOptions.map(option => ({...option, group: "Standard fonts"}))
const standardFamilies = new Set(fontFamilyOptions.flatMap(option => fontFamilies(option.value).slice(0, 1)))
const isStandardFamily = (family: string) => standardFamilies.has(family.toLocaleLowerCase("en"))

/** The font picker shares selection, keyboard navigation and popup behavior. */
export class FontCombobox extends StyleCombobox {
  static properties = {...StyleCombobox.properties, loading: {state: true}, failed: {state: true}, localError: {state: true}, deviceLoading: {state: true}, devicePermissionGranted: {state: true}, selecting: {state: true}}
  static styles = [...StyleCombobox.styles, css`
    .listbox {grid-template-columns: var(--popup-join-width, 5.5rem) minmax(0, 1fr); width: min(var(--font-dropdown-width, 18rem), calc(100vw - 1rem)); overflow: hidden; margin-block: -1px; border: 1px solid #a8a8a8; position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;}
    .option-group {display: flex; flex-direction: column; overflow: auto; max-height: min(22rem, calc(100dvh - 4rem));}
    .option-group + .option-group {contain: size; border-left: 1px solid #d8dee6;}
    .group-label {position: sticky; top: 0; flex: none; margin: 0; padding: .5rem .4rem; background: #fff;}
    .option {flex: none; width: 100%; min-height: 1.75rem;}
    .option-name {padding: .35rem; font-size: .68rem; white-space: normal;}
    .option-code {min-width: 0; white-space: normal; overflow-wrap: anywhere;}
    .option:has(.option-name) {flex-direction: column; align-items: flex-start; gap: .1rem;}
    .option .option-name {padding: 0; font-size: .55rem; overflow-wrap: anywhere;}
    .group-label {display: flex; box-sizing: border-box; min-height: 2.25rem; align-items: center; justify-content: space-between; gap: .3rem; z-index: 2;}
    .import-font, .browse-fonts {border: 0; border-radius: .2rem; color: inherit; background: transparent; font: inherit; cursor: pointer;}
    .import-font {width: 1.25rem; height: 1.25rem; padding: 0; font-size: 1rem; line-height: 1;}
    .import-font:hover, .browse-fonts:hover {background: #e8eef5;}
    .font-section {display: flex; flex: none; flex-direction: column; min-width: 0;}
    .section-label {flex: none; padding: .35rem; font-size: .6rem; font-weight: 700; color: #6b7787; background: #fff;}
    .font-section .section-label {position: sticky; top: 2.25rem; z-index: 1;}
    .browse-fonts {display: flex; align-items: center; gap: .35rem; padding: .35rem; font-size: .68rem; font-style: italic; text-align: start;}
    .browse-fonts svg {flex: none; width: 1rem; height: 1rem;}
    .divider {flex: none; width: calc(100% - .7rem); border: 0; border-top: 1px solid #d8dee6; margin: .25rem .35rem;}
    .local-error {color: #a52a2a;}
    .option-group:has(.search-results) {overflow: hidden;}
    .search-results {display: grid; flex: 1; min-height: 0; grid-template-rows: repeat(2, minmax(0, 1fr));}
    .search-section {display: grid; min-height: 0; overflow: hidden; grid-template-rows: min-content; grid-auto-rows: 1.75rem; align-content: start;}
    .search-section + .search-section {border-top: 1px solid #d8dee6;}
    .search-section .option {height: 1.75rem; min-height: 0; padding-block: .25rem;}
    .search-section .option-code {white-space: nowrap;}
    .search-section .option .option-name {display: none;}
  `, connectedComboboxStyles]

  options = standardFontOptions
  placeholder = "Default font"
  persistent = false
  private fonts: BunnyFont[] = []
  private query = ""
  private hasInput = false
  private loaded = false
  private loading = false
  private failed = false
  private imported: StoredFontFile[] = []
  private devices: DeviceFont[] = []
  private devicePermissionGranted = false
  private deviceLoading = false
  private localError = ""
  private selecting = false
  private dropdownReady = false
  private searchLimits = [0, 0]
  private selectionRequest = 0
  private readonly fontAccess = window as FontAccessWindow
  private readonly previewFamily = `webwriter-font-preview-${crypto.randomUUID()}`
  private previewTarget = ""
  private previewValue = ""
  private previewRequest?: AbortController
  private previewFaces: FontFace[] = []

  private activeOption() {
    const options = this.filteredOptions()
    const selected = this.selectedOption()
    return this.activeIndex >= 0 ? options[this.activeIndex] : options.find(option => option === selected)
  }

  protected optionStyle(option: ComboboxOption, index: number) {
    if(option.group === "Standard fonts") return option.value ? `font-family: ${option.value}` : ""
    if(isLocalOption(option)) return option.source === "installed" ? `font-family: ${cssFontString(option.label)}, sans-serif` : ""
    if(this.activeIndex >= 0 ? index !== this.activeIndex : !this.value || fontFamilies(option.value)[0] !== fontFamilies(this.value)[0]) return ""
    return `font-family: ${this.previewValue === option.value ? `${cssFontString(this.previewFamily)}, ` : ""}${option.value}`
  }

  protected activateOption(_option: ComboboxOption, index: number) {
    if(this.activeIndex === index) return
    this.retainDropdownSize()
    this.activeIndex = index
    this.requestUpdate()
  }

  private clearPreview() {
    this.previewRequest?.abort()
    this.previewRequest = undefined
    for(const face of this.previewFaces) this.ownerDocument.fonts.delete(face)
    this.previewFaces = []
    this.previewTarget = this.previewValue = ""
  }

  private syncPreview() {
    const option = this.open ? this.activeOption() : undefined
    const font = option && option.group === "Custom fonts" && !isLocalOption(option)
      ? this.fonts.find(font => bunnyFontValue(font) === option.value) : undefined
    const target = font ? option!.value : ""
    if(target === this.previewTarget) return
    this.clearPreview()
    if(!font || typeof FontFace === "undefined" || !this.ownerDocument.fonts?.add) return
    this.previewTarget = target
    const controller = this.previewRequest = new AbortController()
    // A list label needs one face; other weights and styles belong to document selection.
    const weight = font.weights.reduce((best, weight) => Math.abs(weight - 400) < Math.abs(best - 400) ? weight : best, font.weights[0] ?? 400)
    const href = bunnyFontStylesheet({...font, weights: [weight], styles: [font.styles.includes("normal") ? "normal" : font.styles[0] ?? "normal"]})
    void fetch(href, {credentials: "omit", signal: controller.signal}).then(async response => {
      if(!response.ok) throw new Error("Font preview unavailable")
      const sheet = new CSSStyleSheet()
      sheet.replaceSync(await response.text())
      if(controller.signal.aborted || !this.open || !this.isConnected) return
      const faces = Array.from(sheet.cssRules).filter(rule => rule.type === 5).map(rule => {
        const style = (rule as CSSFontFaceRule).style
        const source = style.getPropertyValue("src").replace(/url\(\s*(["']?)(.*?)\1\s*\)/g,
          (_match, _quote, url) => `url(${cssFontString(new URL(url, response.url || href).href)})`)
        return new FontFace(this.previewFamily, source, {
          weight: style.fontWeight || "400", style: style.fontStyle || "normal",
          stretch: style.fontStretch || "normal", unicodeRange: style.getPropertyValue("unicode-range") || "U+0-10FFFF", display: "swap",
        })
      })
      this.previewFaces = faces
      for(const face of faces) {
        void face.loaded.catch(() => {})
        this.ownerDocument.fonts.add(face)
      }
      this.previewValue = target
      this.requestUpdate()
    }).catch(() => { /* Preview failures leave the normal label and selection available. */ })
  }

  protected displayedValue() {
    if(!this.value) return ""
    return this.selectedOption()?.label ?? this.value.match(/^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^,]+)/)?.[0].trim().replace(/^(['"])(.*)\1$/, "$2") ?? this.value
  }

  protected selectedOption() {
    const family = fontFamilies(this.value)[0]
    const option = this.options.find(option => fontFamilies(option.value)[0] === family)
    if(option) return option
    const font = this.fonts.find(font => font.familyName.toLocaleLowerCase("en") === family)
    if(font) return {label: font.familyName, value: bunnyFontValue(font)}
    const local = this.imported.find(record => record.name.toLocaleLowerCase("en") === family)?.name
      ?? this.devices.find(font => font.family.toLocaleLowerCase("en") === family)?.family
    return local ? {label: local, value: this.value} : undefined
  }

  protected filteredOptions() {
    if(!this.query || !this.dropdownReady) return this.options
    const rank = (option: ComboboxOption) => {
      const label = option.label.toLocaleLowerCase("en")
      return label === this.query ? 0 : label.startsWith(this.query) ? 1 : 2
    }
    const matches = this.options.filter(option => option.label.toLocaleLowerCase("en").includes(this.query))
    const sorted = ["Standard fonts", "Custom fonts"].flatMap(group => matches.filter(option => option.group === group)
      .sort((a, b) => {
        const section = (option: ComboboxOption) => !isLocalOption(option) ? 2 : option.source === "installed" ? 0 : 1
        return section(a) - section(b) || rank(a) - rank(b)
      }))
    if(!this.splitSearch()) return sorted
    const counts = [0, 0]
    return sorted.filter(option => option.group === "Standard fonts"
      || ++counts[this.searchSection(option)] <= this.searchLimits[this.searchSection(option)])
  }

  private splitSearch() { return Boolean(this.query && this.dropdownReady && this.devicePermissionGranted) }
  private searchSection(option: ComboboxOption) { return isLocalOption(option) && option.source === "installed" ? 0 : 1 }

  protected renderGroupOptions(group: string, entries: {option: ComboboxOption, index: number}[]): unknown {
    if(group !== "Custom fonts") return super.renderGroupOptions(group, entries)
    if(!this.splitSearch()) {
      const sections = [
        {source: "installed", heading: "INSTALLED FONTS"},
        {source: "imported", heading: "Imported fonts"},
        {source: "online", heading: "WEB FONTS"},
      ].map(section => ({...section, entries: entries.filter(({option}) => (isLocalOption(option) ? option.source : "online") === section.source)}))
        .filter(section => section.entries.length || section.source === "online" || section.source === "installed" && this.devicePermissionGranted)
      return html`${this.renderBeforeOptions(group)}
        ${sections.map((section, index) => html`
          ${index || this.fontAccess.queryLocalFonts && !this.devicePermissionGranted ? html`<hr class="divider" role="separator">` : nothing}
          <div class="font-section">
            <div class="section-label">${section.heading}</div>
            ${section.entries.length ? this.renderOptionEntries(section.entries, false) : section.source === "installed"
              ? html`<span class="option-name" role="status">${this.deviceLoading ? "Loading installed fonts…" : "No matching installed fonts"}</span>`
              : this.renderEmptyOptions(group)}
          </div>`)}
      `
    }
    return html`
      ${this.localError ? html`<span class="option-name local-error" role="status">${this.localError}</span>` : nothing}
      ${this.selecting ? html`<span class="option-name" role="status">Adding font…</span>` : nothing}
      <div class="search-results">
        ${[0, 1].map(section => {
          const results = entries.filter(({option}) => this.searchSection(option) === section)
          const heading = section === 0 ? "INSTALLED FONTS" : this.imported.length ? "WEB AND IMPORTED FONTS" : "WEB FONTS"
          return html`<div class="search-section" role="group" aria-label=${heading}>
            <div class="section-label" aria-hidden="true">${heading}</div>
            ${results.length ? this.renderOptionEntries(results, false) : section === 0
              ? html`<span class="option-name" role="status">${this.deviceLoading ? "Loading installed fonts…" : "No matching installed fonts"}</span>`
              : this.renderEmptyOptions(group)}
          </div>`
        })}
      </div>`
  }

  private measureSearchResults() {
    if(!this.splitSearch()) return
    const sections = [...this.renderRoot.querySelectorAll<HTMLElement>(".search-section")]
    const limits = sections.map(section => {
      const heading = section.querySelector<HTMLElement>(".section-label")!
      const rowHeight = parseFloat(getComputedStyle(section).gridAutoRows)
      return Math.max(0, Math.floor((section.clientHeight - heading.getBoundingClientRect().height) / rowHeight)) || 0
    })
    if(limits.length !== 2 || limits.every((limit, index) => limit === this.searchLimits[index])) return
    this.searchLimits = limits
    this.highlightBestMatch()
    this.requestUpdate()
  }

  private highlightBestMatch() {
    const options = this.filteredOptions()
    const customIndex = options.findIndex(option => option.group === "Custom fonts")
    this.activeIndex = this.query && options.length ? Math.max(0, customIndex) : -1
    if(this.activeIndex >= 0) this.revealActiveOption()
  }

  private revealActiveOption() {
    void this.updateComplete.then(() => {
      this.renderRoot.querySelector("[data-active]")?.scrollIntoView?.({block: "nearest"})
    })
  }

  protected optionGroups(options: readonly ComboboxOption[]) {
    const groups = super.optionGroups(options)
    return new Map(["Standard fonts", "Custom fonts"].map(group => [group, groups.get(group) ?? []]))
  }

  protected renderGroupHeading(group: string) {
    if(group !== "Custom fonts") return super.renderGroupHeading(group)
    return html`<div class="group-label"><span aria-hidden="true">${group}</span>
      <button type="button" class="import-font" aria-label="Import font file" title="Import font file"
        ?disabled=${this.selecting} @mousedown=${(event: MouseEvent) => event.preventDefault()} @click=${this.importFont}>+</button></div>`
  }

  protected renderBeforeOptions(group: string) {
    if(group !== "Custom fonts") return nothing
    return html`
      ${this.localError ? html`<span class="option-name local-error" role="status">${this.localError}</span>` : nothing}
      ${this.selecting ? html`<span class="option-name" role="status">Adding font…</span>` : nothing}
      ${this.fontAccess.queryLocalFonts && !this.devicePermissionGranted ? html`<button class="browse-fonts" type="button" ?disabled=${this.deviceLoading}
            @mousedown=${(event: MouseEvent) => event.preventDefault()} @click=${this.loadDeviceFonts}>${ribbonIcon("Family")}<span>Load installed fonts</span></button>`
        : nothing}`
  }

  protected select(option: ComboboxOption, event?: Event) {
    if(isLocalOption(option)) { void this.applyLocalFont(option); return }
    this.selectionRequest++
    this.selecting = false
    super.select(option, event)
  }

  private async applyLocalFont(option: LocalFontOption) {
    if(this.disabled) return
    const request = ++this.selectionRequest
    this.selecting = true
    this.localError = ""
    try {
      let files: Blob[]
      if(option.devices) files = await Promise.all(option.devices.map(font => font.blob()))
      else {
        const record = option.record!
        const handle = record.handle
        // Restored handles can need a fresh gesture to regain read permission.
        if(handle?.requestPermission && await handle.requestPermission({mode: "read"}) !== "granted") throw new Error("Allow access to this font file or import it again.")
        files = [handle ? await handle.getFile() : record.file!]
      }
      const embedded = await embedFontFiles(files, option.devices?.[0].family)
      if(request === this.selectionRequest && this.isConnected && !this.disabled) this.emitEmbedded(embedded)
    }
    catch(error) { if(request === this.selectionRequest) this.showLocalError(error) }
    finally { if(request === this.selectionRequest) this.selecting = false }
  }

  private emitEmbedded(font: EmbeddedFont) {
    this.dispatchEvent(new CustomEvent("font-change", {detail: {value: font.value, fontStylesheet: font.stylesheet}, bubbles: true, composed: true}))
    super.emit(font.value)
  }

  private showLocalError(error: unknown) {
    this.localError = error instanceof Error ? error.message : String(error)
    if(this.isConnected && !this.disabled) void this.setOpen(true)
  }

  private importFont() {
    if(this.disabled || this.selecting) return
    const picker = (window as Window & {showOpenFilePicker?: (options: object) => Promise<FontFileHandle[]>}).showOpenFilePicker
    if(!picker) { this.renderRoot.querySelector<HTMLInputElement>('input[type="file"]')!.click(); return }
    void picker.call(window, {id: "webwriter-font", multiple: false,
      types: [{description: "Font files", accept: {"font/woff": [".woff"], "font/woff2": [".woff2"], "font/ttf": [".ttf"], "font/otf": [".otf"]}}]})
      .then(async handles => { if(handles[0]) await this.addFont(await handles[0].getFile(), handles[0]) })
      .catch(error => { if(error?.name !== "AbortError") this.showLocalError(error) })
  }

  private async addFont(file: File, handle?: FontFileHandle) {
    const request = ++this.selectionRequest
    this.selecting = true
    this.localError = ""
    try {
      const font = await embedFontFiles([file])
      const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
      const id = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("")
      const record = {id, name: font.family, ...(handle ? {handle} : {file})}
      let storageError: unknown
      try { await saveFontFile(record) }
      catch(error) { storageError = error }
      this.imported = [...this.imported.filter(font => font.id !== id), record]
      if(request !== this.selectionRequest || !this.isConnected || this.disabled) return
      this.emitEmbedded(font)
      if(storageError) this.showLocalError("Font added to this document, but could not be remembered on this device.")
    }
    catch(error) { if(request === this.selectionRequest) this.showLocalError(error) }
    finally { if(request === this.selectionRequest) this.selecting = false }
  }

  render() {
    return html`${super.render()}<input type="file" hidden accept=".woff,.woff2,.ttf,.otf"
      @change=${(event: Event) => {
        const input = event.currentTarget as HTMLInputElement, file = input.files?.[0]
        input.value = ""
        if(file) void this.addFont(file)
      }}>`
  }

  protected renderEmptyOptions(group: string) {
    const message = group === "Custom fonts" && this.loading ? "Loading fonts…"
      : group === "Custom fonts" && this.failed ? "Could not load fonts. Reopen to retry." : "No matching fonts"
    return html`<span class="option-name" role="status">${message}</span>`
  }

  protected handleInput(event: InputEvent) {
    this.retainDropdownSize()
    this.hasInput = true
    this.query = (event.currentTarget as HTMLInputElement).value.trim().toLocaleLowerCase("en")
    super.handleInput(event)
    this.highlightBestMatch()
  }

  private retainDropdownSize() {
    const popup = this.renderRoot.querySelector<HTMLElement>(".listbox")
    if(!popup || popup.style.height) return
    const box = popup.getBoundingClientRect()
    const standard = popup.querySelector<HTMLElement>(".option-group")?.getBoundingClientRect()
    if(!box.width || !box.height || !standard?.width) return
    popup.style.width = `${box.width}px`
    popup.style.height = `${box.height}px`
    popup.style.gridTemplateColumns = `${standard.width}px minmax(0, 1fr)`
  }

  protected handleInputClick() {
    super.handleInputClick()
    if(!this.hasInput) this.renderRoot.querySelector<HTMLInputElement>("input")?.select()
  }

  protected commitDraft() {
    const draft = this.renderRoot.querySelector<HTMLInputElement>("input")?.value.trim().toLocaleLowerCase("en") ?? ""
    if(!draft) { this.close(true); return }
    const option = this.options.find(option => option.label.toLocaleLowerCase("en") === draft || option.value.toLocaleLowerCase("en") === draft)
    if(option) this.select(option)
    else this.close(true)
  }

  protected emit(value: string) {
    if(this.disabled) return
    const font = this.fonts.find(font => bunnyFontValue(font) === value)
    // Ribbon listeners consume the stylesheet together with the authored stack.
    this.dispatchEvent(new CustomEvent("font-change", {
      detail: {value, ...(font ? {fontStylesheet: bunnyFontStylesheet(font)} : {})}, bubbles: true, composed: true,
    }))
    super.emit(value)
  }

  close(reset = true) {
    this.clearPreview()
    this.dropdownReady = false
    this.query = ""
    this.hasInput = false
    this.searchLimits = [0, 0]
    super.close(reset)
    this.options = standardFontOptions
    this.renderRoot?.querySelector(".control")?.removeAttribute("data-connected")
    const popup = this.renderRoot?.querySelector<HTMLElement>(".listbox")
    for(const property of ["width", "height", "grid-template-columns"]) popup?.style.removeProperty(property)
  }

  protected cancelInput() {
    this.selectionRequest++
    this.selecting = false
    super.cancelInput()
  }

  disconnectedCallback() {
    this.selectionRequest++
    this.selecting = false
    super.disconnectedCallback()
  }

  protected handleKeydown(event: KeyboardEvent) {
    if(this.disabled || event.isComposing) return
    const input = this.renderRoot.querySelector<HTMLInputElement>("input")!
    if(event.key === "Enter" && !input.value.trim()) {
      event.preventDefault()
      this.commitDraft()
      input.blur()
      return
    }
    if(event.key === "Tab" && !event.shiftKey && this.open && this.query) {
      const best = this.filteredOptions().find(option => option.group === "Custom fonts")
      if(best && input.value !== best.label) {
        event.preventDefault()
        input.value = best.label
        input.dispatchEvent(new InputEvent("input", {bubbles: true, composed: true, inputType: "insertReplacementText"}))
        input.setSelectionRange(best.label.length, best.label.length)
        return
      }
    }
    super.handleKeydown(event)
    if(event.key === "ArrowDown" || event.key === "ArrowUp") this.revealActiveOption()
  }

  protected setOpen(open: boolean) {
    if(!open) { this.close(); return Promise.resolve() }
    const wasOpen = this.open
    const update = super.setOpen(open)
    void update.then(() => this.connectDropdown())
    if(this.open && !wasOpen) {
      const selectInput = !this.hasInput
      if(selectInput) { this.query = ""; this.activeIndex = -1 }
      void this.loadFonts()
      void this.loadImportedFonts()
      void this.checkDevicePermission()
      void update.then(() => {
        if(!this.open || !this.isConnected) return
        if(this.hasInput) this.retainDropdownSize()
        this.dropdownReady = true
        this.highlightBestMatch()
        this.requestUpdate()
        if(!selectInput || this.hasInput) return
        const input = this.renderRoot.querySelector<HTMLInputElement>("input")!
        input.focus()
        input.select()
      })
    }
    else if(!this.open) this.options = standardFontOptions
    return update
  }

  protected updated(changed: Map<string, unknown>) {
    if(changed.has("disabled") && this.disabled) { this.selectionRequest++; this.selecting = false }
    super.updated(changed)
    this.connectDropdown()
    this.measureSearchResults()
    this.syncPreview()
  }

  private connectDropdown() {
    const control = this.renderRoot.querySelector<HTMLElement>(".control")
    const popup = this.renderRoot.querySelector<HTMLElement>(".listbox")
    if(this.open && control && popup) connectPopup(control, popup)
  }

  private populateOptions() {
    if(!this.open || !this.isConnected) return
    const activeValue = this.activeIndex >= 0 ? this.filteredOptions()[this.activeIndex]?.value : undefined
    const devices = new Map<string, DeviceFont[]>()
    for(const font of this.devices) if(!isStandardFamily(font.family)) devices.set(font.family, [...devices.get(font.family) ?? [], font])
    const installed: LocalFontOption[] = [...devices].sort(([a], [b]) => a.localeCompare(b)).map(([family, fonts]) => ({
      label: family, value: `installed:${family}`, source: "installed", devices: fonts, group: "Custom fonts",
    }))
    const imported: LocalFontOption[] = this.imported.filter(record => !isStandardFamily(record.name)).map(record => ({label: record.name, value: `imported:${record.id}`,
      description: record.handle?.name ?? record.file?.name, source: "imported", record, group: "Custom fonts"}))
    this.options = [...standardFontOptions, ...installed, ...imported,
      ...this.fonts.filter(font => !isStandardFamily(font.familyName)).map(font => ({label: font.familyName, value: bunnyFontValue(font), group: "Custom fonts"}))]
    if(this.query) this.highlightBestMatch()
    else this.activeIndex = activeValue === undefined ? -1 : this.options.findIndex(option => option.value === activeValue)
  }

  private async loadImportedFonts() {
    const restored = await readFontFiles()
    this.imported = [...restored, ...this.imported.filter(record => !restored.some(saved => saved.id === record.id))]
    this.populateOptions()
  }

  private async checkDevicePermission() {
    if(!this.fontAccess.queryLocalFonts) return
    try {
      const permission = await this.fontAccess.navigator.permissions.query({name: "local-fonts" as PermissionName})
      this.devicePermissionGranted = permission.state === "granted"
      if(this.devicePermissionGranted) { if(!this.devices.length) await this.loadDeviceFonts() }
      else { this.devices = []; this.populateOptions() }
    }
    catch { /* Browsers without a permissions query use the explicit load action. */ }
  }

  private async loadDeviceFonts() {
    if(!this.fontAccess.queryLocalFonts || this.deviceLoading) return
    this.deviceLoading = true
    try {
      this.devices = (await this.fontAccess.queryLocalFonts()).filter(font => typeof font.family === "string" && typeof font.blob === "function")
      this.devicePermissionGranted = true
      this.populateOptions()
    }
    catch { this.devicePermissionGranted = false; this.devices = []; this.populateOptions() }
    finally { this.deviceLoading = false }
  }

  private async loadFonts() {
    if(this.loaded) { this.populateOptions(); return }
    if(this.loading) return
    this.loading = true
    this.failed = false
    try {
      this.fonts = await bunnyFonts()
      this.loaded = true
      this.populateOptions()
    }
    catch { this.failed = true }
    finally { this.loading = false }
  }
}

if(!customElements.get("font-combobox")) customElements.define("font-combobox", FontCombobox)

declare global {
  interface HTMLElementTagNameMap { "font-combobox": FontCombobox }
}
