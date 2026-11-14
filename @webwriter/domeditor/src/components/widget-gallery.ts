import {LitElement, css, html, nothing, unsafeCSS} from "lit"
import {repeat} from "lit/directives/repeat.js"
import {unsafeSVG} from "lit/directives/unsafe-svg.js"
import arrowRightIcon from "@tabler/icons/outline/arrow-right.svg?raw"
import codeIcon from "@tabler/icons/outline/code.svg?raw"
import chevronLeftIcon from "@tabler/icons/outline/chevron-left.svg?raw"
import chevronRightIcon from "@tabler/icons/outline/chevron-right.svg?raw"
import {WebWriterPackageRegistry, type PackageMember, type WebWriterPackage} from "../packages"
import {fetchWithin} from "../npm-files"
import {galleryDocument, galleryExample, galleryPreviewPackages, galleryPackages, galleryTagFilters, type GalleryWidget} from "../widget-gallery"
import {editorFrameOrigin} from "../frame-origins"
import {previewFrameHTML} from "../frame-document"
import {resolvePackageDependencies} from "../package-dependencies"
import {cardOverlayStyles} from "./card-overlay"
import {language, t, SiteLanguageController} from "../site-language"
import galleryPreviewEntryURL from "virtual:app-entry/gallery-preview-entry"
import type {EditorView} from "@codemirror/view"
import {packageGalleryPath, packageGalleryURL, packageNameFromPath} from "../package-gallery-route"
import {packageKeywordPresentations, type PackageKeywordPresentation} from "../package-keywords"
import packageKeywordStyles from "../package-keywords.css?raw"
import {galleryLanguageOptions} from "../gallery-languages"
import {ribbonIcon} from "../ribbon-icons"

const previewEditDelay = 300
const exampleHTMLLimit = 50_000_000
type GalleryFrame = {
  url: string, nonce: string, html: string, ready: boolean, height: number,
  timeout?: ReturnType<typeof setTimeout>, markup?: string, editableMarkup?: string,
}
const previewMembers = (pkg: WebWriterPackage) => pkg.members.filter(member => member.insertable && (member.kind === "widget" || member.kind === "snippet"))
const npmPackageURL = (name: string) => `https://www.npmjs.com/package/${encodeURI(name)}`
type KeywordLabel = Pick<PackageKeywordPresentation, "kind" | "label">
const isOnlineOnly = ({kind, label}: KeywordLabel) => kind === "online" && label === "Online only"
const onlineOnlyLast = (a: KeywordLabel, b: KeywordLabel) => Number(isOnlineOnly(a)) - Number(isOnlineOnly(b))
const extraEducationLevels = ["0", "1", "8", "4", "5"].map(code =>
  packageKeywordPresentations([`isced2011-${code}`], "en")[0])
const extraEducationLevelIndex = ({kind, label}: KeywordLabel) =>
  extraEducationLevels.findIndex(level => level.kind === kind && level.label === label)

export class WidgetGallery extends LitElement {
  private languageController = new SiteLanguageController(this)
  static properties = {
    wall: {type: Boolean, reflect: true},
    packages: {state: true}, loading: {state: true}, error: {state: true}, query: {state: true}, selectedTag: {state: true}, selectedLanguage: {state: true},
    moreTagsOpen: {state: true},
    selected: {state: true}, previewStatus: {state: true}, previewError: {state: true},
    frames: {state: true}, shared: {state: true}, editing: {state: true}, codeVisible: {state: true}, exampleMarkup: {state: true},
    routeName: {state: true}, routeError: {state: true}, detail: {state: true}, codeParticipant: {state: true},
    tabsOverflow: {state: true}, tabsCanScrollLeft: {state: true}, tabsCanScrollRight: {state: true},
  }

  static styles = [cardOverlayStyles, unsafeCSS(packageKeywordStyles), css`
    :host {display: block; color: #263142; --accent: #155e9b; --border: #dfe5ed}
    * {box-sizing: border-box}
    button, input {font: inherit}
    button {cursor: pointer}
    button, input[type="search"] {min-block-size: 2.75rem; border: 1px solid var(--border); border-radius: .35rem; background: #fff; color: inherit; padding: .5rem .8rem}
    button:hover:not(:disabled, .tag-filter) {background: #eaf2fb; border-color: #a9bed6}
    button:disabled {cursor: default; opacity: .6}
    :is(button, input, select, a):focus-visible {outline: 2px solid var(--accent); outline-offset: 3px}
    a {color: var(--accent); text-underline-offset: .2em}
    .filters {display: grid; gap: .9rem; padding-block-end: 1.25rem; border-bottom: 1px solid var(--border)}
    .search-row {display: flex; align-items: end; flex-wrap: wrap; gap: 1rem}
    .search {display: grid; gap: .4rem; flex: 1; min-inline-size: min(100%, 15rem); font-size: .875rem; font-weight: 600}
    .search input {inline-size: 100%}
    .tag-filters {min-inline-size: 0; margin: 0; border: 0; padding: 0}
    .tag-filters legend {padding: 0; margin-block-end: .4rem; font-size: .875rem; font-weight: 600}
    .tag-options {display: flex; flex-wrap: wrap; gap: .4rem}
    .tag-options + .tag-options {margin-block-start: .55rem}
    .more-tag-filters-toggle {min-block-size: 1.5rem; padding: .15rem .4rem; border-color: transparent; background: transparent; color: var(--accent); font-size: .725rem}
    .tag-filter {min-block-size: 1.5rem; overflow-wrap: anywhere}
    .tag-filter:hover, .language-filter:hover select {border-color: var(--accent)}
    .tag-filter[aria-pressed="true"], .language-filter.active select {border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent)}
    @media (forced-colors: active) {
      .tag-filter[aria-pressed="true"], .language-filter.active select {border-style: dashed}
    }
    .language-filter {position: relative; min-inline-size: 0; max-inline-size: 100%}
    .language-filter select {display: block; field-sizing: content; min-block-size: 100%; max-inline-size: 100%; padding-inline-start: 1.5rem; font-family: inherit; cursor: pointer}
    .language-filter .keyword-icon {position: absolute; inset-inline-start: .4rem; inset-block: 0; pointer-events: none}
    @media (pointer: coarse) {
      .tag-filter, .more-tag-filters-toggle, .language-filter select {min-block-size: 3rem}
      .language-filter select {font-size: 1rem}
    }
    .count, .status {color: #617084; font-size: .875rem}
    .count {margin-block: 1.25rem}
    .cards {display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr)); gap: 1.25rem; list-style: none; margin: 0; padding: 0}
    .cards li {min-inline-size: 0}
    article {display: flex; flex-direction: column; block-size: 100%; padding: 1.4rem; border: 1px solid var(--border); border-radius: .6rem; background: white; overflow-wrap: anywhere}
    .card-heading {display: flex; align-items: center; gap: .85rem}
    .card-heading h3 {min-inline-size: 0}
    .icon {inline-size: 2.5rem; block-size: 2.5rem; object-fit: contain; flex: none}
    .placeholder {display: grid; place-items: center; background: #eaf2fb; border-radius: .4rem; font-size: 1.2rem; color: var(--accent)}
    h2, h3 {margin: 0; color: #172033; line-height: 1.3}
    h3 {font-size: 1.1rem}
    .package {margin-block: .9rem .5rem; font-size: .75rem; color: #617084}
    .description {margin: 0; font-size: .875rem; color: #536174}
    .card-keywords {margin-block-start: .65rem}
    .try {display: inline-flex; align-items: center; justify-content: center; gap: .35rem; flex: none; align-self: start; margin-inline-start: auto; min-block-size: 2.75rem; padding: .5rem .8rem; border: 1px solid var(--border); border-radius: .35rem; background: white; font-size: .8125rem; font-weight: 600; text-decoration: none; white-space: nowrap}
    .try:hover {background: #eaf2fb; border-color: #a9bed6}
    .try span {display: grid; place-items: center}
    .try svg {inline-size: 1rem; block-size: 1rem}
    .error {padding: 1rem; border: 1px solid #e6b5ad; border-radius: .4rem; background: #fff8f6; color: #923b2e; overflow-wrap: anywhere}
    .package-page {display: block; padding: 0; border: 0; background: transparent}
    .preview-heading {display: grid; grid-template-columns: minmax(0, 1fr); gap: .65rem; padding-block: 2rem 1.25rem}
    .details-heading {display: grid; grid-template-columns: 3.25rem minmax(0, 1fr); gap: .75rem; align-items: start; overflow-wrap: anywhere}
    .details-leading {position: relative; min-block-size: 3.25rem}
    .details-leading > .icon {inline-size: 100%; block-size: 3.25rem}
    .details-title, .details-byline {display: flex; flex-wrap: wrap; align-items: baseline; gap: .25rem .85rem}
    .details-title {align-items: center}
    .details-title h1 {font-size: clamp(1.8rem, 5vw, 2.6rem); line-height: 1.15; margin: 0}
    .details-byline {margin-block-start: .5rem}
    .details-subheading, .details-authors, .details-license {font-size: .875rem; margin: 0}
    .details-subheading {margin-inline-start: auto; text-align: end}
    .details-authors, .details-license {color: #536174}
    .details-description, .details-keywords {grid-column: 1 / -1; margin: 0}
    .details-description {max-inline-size: 72ch; color: #263142}
    .keyword-list {display: flex; flex-wrap: wrap; gap: .35rem; margin-inline: 0; margin-block-end: 0; padding: 0; list-style: none}
    .keyword-list .keyword-badge > span:not(.keyword-icon) {min-inline-size: 0; overflow-wrap: anywhere}
    .keyword-badge {display: inline-flex; gap: .25rem; align-items: center; max-inline-size: 100%; padding: .15rem .4rem; border: 1px solid currentColor; border-radius: .4rem; font-size: .725rem}
    .keyword-icon {display: grid; place-items: center; flex: none}
    .keyword-icon svg {inline-size: .85rem; block-size: .85rem}
    .preview-viewer {border: 1px solid var(--border); border-radius: .65rem; overflow: hidden}
    .preview-viewer.code-open {
      --code-outset: clamp(0rem, (100cqi - var(--site-max-inline-size, 76rem)) / 2, 12rem);
      margin-inline: calc(-1 * var(--code-outset));
    }
    .preview-tab-row {display: grid; grid-template-columns: auto minmax(0, 1fr) auto; border-block-end: 1px solid var(--border); background: #f7f9fc}
    .preview-tab-scrollport {grid-area: 1 / 2; overflow-x: auto; scrollbar-width: none}
    .preview-tab-scrollport::-webkit-scrollbar {display: none}
    @media (prefers-reduced-motion: no-preference) {.preview-tab-scrollport {scroll-behavior: smooth}}
    .preview-members {display: flex; inline-size: max-content; gap: .25rem; padding-inline: 1.5rem}
    .preview-tab-arrow {grid-row: 1; display: grid; place-items: center; inline-size: 2.125rem; min-block-size: 2.125rem; padding: 0; border: 0; border-radius: 0; background: transparent; color: #104a7b}
    .preview-tab-arrow[hidden] {display: none}
    .preview-tab-arrow[aria-disabled="true"] {opacity: .4; cursor: default; background: transparent}
    .preview-tab-arrow:focus-visible {outline-offset: -3px}
    .preview-tab-arrow svg {display: block; inline-size: 1rem; block-size: 1rem}
    .preview-tab-left, .preview-tab-right:dir(rtl) {grid-column: 1}
    .preview-tab-right, .preview-tab-left:dir(rtl) {grid-column: 3}
    .preview-members button {position: relative; flex: none; min-block-size: 2.125rem; padding: .35rem .65rem; border: 0; border-radius: .25rem .25rem 0 0; background: transparent; color: #536174; font-size: .8125rem; font-weight: 600; white-space: nowrap}
    .preview-members button:hover {background: #eaf2fb; color: #104a7b}
    .preview-members button[aria-selected="true"] {color: #104a7b}
    .preview-members button[aria-selected="true"]::after {content: ""; position: absolute; inset: auto 0 0; border-block-end: 2px solid currentColor}
    .preview-members button:focus-visible {outline-offset: -3px}
    .preview-toolbar {display: flex; align-items: start; gap: .5rem; padding: .35rem 1.5rem; border-block-start: 1px solid var(--border); background: #f1f3f5}
    .preview-modes {display: flex; justify-content: end; flex-wrap: wrap; gap: .5rem 1rem; flex: 1}
    .preview-modes [role="group"] {display: inline-flex}
    .preview-modes button {min-block-size: 1.75rem; padding: .2rem .55rem; font-size: .8125rem; line-height: 1.25; position: relative}
    .preview-modes button:first-child {border-start-end-radius: 0; border-end-end-radius: 0}
    .preview-modes button:last-child {margin-inline-start: -1px; border-start-start-radius: 0; border-end-start-radius: 0}
    .preview-modes button[aria-pressed="true"], .preview-code-toggle[aria-expanded="true"] {background: #e2eff9; color: #104a7b; font-weight: 650}
    .preview-modes button:focus-visible {z-index: 1}
    .icon-button {display: grid; place-items: center; inline-size: 2.25rem; block-size: 2.25rem; min-block-size: 0; padding: 0; flex: none; border: 1px solid var(--border); border-radius: .35rem; background: white; color: inherit}
    .icon-button:hover:not(:disabled) {background: #eaf2fb; border-color: #a9bed6}
    .icon-button > span {display: contents}
    .icon-button svg {display: block; inline-size: 1.2rem; block-size: 1.2rem}
    .package-back {position: absolute; inset-inline-end: 100%; inset-block: 0; margin-block: auto; inline-size: min(1.5rem, var(--site-gutter, 1rem)); border: 0; background: transparent}
    .package-back:focus-visible {outline-offset: -2px}
    .package-back svg {inline-size: .875rem; block-size: .875rem}
    .package-back:dir(rtl) svg {transform: scaleX(-1)}
    .preview-code-toggle {inline-size: 1.75rem; block-size: 1.75rem}
    .preview-code-toggle svg {inline-size: 1rem; block-size: 1rem}
    .preview-panes {display: grid; grid-template-columns: minmax(0, 1fr)}
    .preview-panes.with-code {grid-template-columns: minmax(0, 3fr) minmax(0, 2fr)}
    .preview-participants {display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr)); gap: 1px; background: var(--border)}
    .preview-participant {min-inline-size: 0; background: white}
    .preview-participant h3 {padding: .5rem 1rem; font-size: .8125rem; border-block-end: 1px solid var(--border)}
    .preview-code {min-inline-size: 0; border-inline-start: 1px solid var(--border); background: #f7f9fc}
    .preview-code-header {display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .5rem; padding: .75rem 1rem; border-block-end: 1px solid var(--border)}
    .preview-code h3 {font-size: .875rem}
    .preview-code select {max-inline-size: 100%; font: inherit; font-size: .8125rem}
    .preview-code .cm-editor {max-block-size: 60dvh; min-block-size: 9rem; font: .8125rem/1.6 ui-monospace, monospace}
    .preview-code .cm-content {padding: .75rem; overflow-wrap: anywhere}
    .preview-code[hidden] {display: none}
    .preview-status, .preview-error {margin: 1rem 1.5rem}
    iframe {display: block; inline-size: 100%; border: 0; background: white; min-block-size: 22rem; max-block-size: 70dvh}
    .empty {padding-block: 2rem; color: #617084}
    :host([wall]) {min-block-size: 8rem}
    :host([wall]) .cards {grid-template-columns: repeat(auto-fill, minmax(min(100%, 7.5rem), 1fr)); gap: 1rem; padding: .25rem}
    .widget-tile {display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .65rem; inline-size: 100%; aspect-ratio: 1; padding: .75rem; border: 1px solid var(--border); background: white; border-radius: .6rem; color: #172033; text-decoration: none}
    .widget-tile .icon {inline-size: 2.25rem; block-size: 2.25rem}
    .tile-label {display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; min-block-size: 2.5em; font-size: .8rem; font-weight: 600; line-height: 1.25; overflow-wrap: anywhere}
    @media (max-width: 35rem) {
      :host([wall]) .cards {grid-template-columns: repeat(auto-fill, minmax(min(100%, 6rem), 1fr)); gap: .75rem}
      .widget-tile {gap: .5rem; padding: .5rem}
      .widget-tile .icon {inline-size: 1.75rem; block-size: 1.75rem}
      .tile-label {font-size: .75rem}
    }
    @media (max-width: 44rem) {
      .preview-panes.with-code {grid-template-columns: minmax(0, 1fr)}
      .preview-code {border-inline-start: 0; border-block-start: 1px solid var(--border)}
      .preview-panes.with-code iframe {min-block-size: 13rem; max-block-size: 36dvh}
    }
    @media (max-width: 35rem) {article:not(.package-page) {padding: 1.1rem} .preview-members, .preview-toolbar {padding-inline: 1rem}}
  `]

  wall = false
  private packages: WebWriterPackage[] = []
  private loading = false
  private error = ""
  private routeError = ""
  private routeName: string | null = null
  private detail: WebWriterPackage | null = null
  private routeRevision = 0
  private query = ""
  private selectedTag = ""
  private selectedLanguage = ""
  private moreTagsOpen = false
  private tagFilters = galleryTagFilters([])
  private selected: GalleryWidget | null = null
  private previewStatus = ""
  private previewError = ""
  private frames: GalleryFrame[] = []
  private createFrame?: () => GalleryFrame
  private shared = false
  private editing = true
  private fitVideo = false
  private registry = new WebWriterPackageRegistry(undefined, "en")
  private catalogAbort = new AbortController()
  private catalogReady?: Promise<void>
  private previewRevision = 0
  private exampleMarkup: string | null = null
  private documentMarkup?: string
  private codeParticipant = 0
  private codeVisible = false
  private codeEditor?: EditorView
  private editTimer?: ReturnType<typeof setTimeout>
  private pendingCode = false
  private previewTimeout?: ReturnType<typeof setTimeout>
  private dependencyPlans = new Map<string, ReturnType<typeof resolvePackageDependencies>>()
  private tabRow: HTMLElement | null = null
  private tabResizeObserver?: ResizeObserver
  private tabsOverflow = false
  private tabsCanScrollLeft = false
  private tabsCanScrollRight = false

  connectedCallback() {
    super.connectedCallback()
    window.addEventListener("message", this.onMessage)
    window.addEventListener("popstate", this.onPopState)
    void this.refresh()
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.tabResizeObserver?.disconnect()
    this.tabRow = null
    this.catalogAbort.abort()
    this.closePreview()
    window.removeEventListener("message", this.onMessage)
    window.removeEventListener("popstate", this.onPopState)
  }

  protected updated() {
    const row = this.renderRoot.querySelector<HTMLElement>(".preview-tab-row")
    if(row === this.tabRow) return
    this.tabResizeObserver?.disconnect()
    this.tabRow = row
    if(row) {
      this.tabResizeObserver ??= new ResizeObserver(this.updateTabScroll)
      this.tabResizeObserver.observe(row)
      this.tabResizeObserver.observe(row.querySelector(".preview-members")!)
    }
    this.updateTabScroll()
  }

  private updateTabScroll = () => {
    const row = this.tabRow
    const scroller = row?.querySelector<HTMLElement>(".preview-tab-scrollport")
    if(!row || !scroller) {
      this.tabsOverflow = this.tabsCanScrollLeft = this.tabsCanScrollRight = false
      return
    }
    this.tabsOverflow = scroller.scrollWidth > row.clientWidth
    const end = scroller.scrollWidth - scroller.clientWidth
    const position = getComputedStyle(scroller).direction === "rtl" ? end + scroller.scrollLeft : scroller.scrollLeft
    this.tabsCanScrollLeft = position > 1
    this.tabsCanScrollRight = position < end - 1
  }

  private scrollTabs(direction: -1 | 1) {
    const canScroll = direction < 0 ? this.tabsCanScrollLeft : this.tabsCanScrollRight
    const scroller = this.tabRow?.querySelector<HTMLElement>(".preview-tab-scrollport")
    if(!canScroll || !scroller) return
    scroller.scrollBy({left: direction * scroller.clientWidth * .8})
  }

  private async refresh() {
    this.closePreview()
    this.catalogAbort.abort()
    const controller = this.catalogAbort = new AbortController()
    this.registry = new WebWriterPackageRegistry((input, init) => fetchWithin(fetch, String(input), {
      ...init, signal: controller.signal, credentials: "omit",
    }, 15_000), "en")
    this.dependencyPlans.clear()
    this.loading = true
    this.error = ""
    this.routeError = ""
    this.catalogReady = this.loadCatalog(controller.signal)
    if(!this.wall && packageNameFromPath(location.pathname)) await this.syncRoute()
    await this.catalogReady
  }

  private async loadCatalog(signal: AbortSignal) {
    try {
      const packages = await this.registry.search()
      if(!signal.aborted) {
        this.packages = packages.filter(pkg => pkg.name.startsWith("@webwriter/"))
        this.tagFilters = galleryTagFilters(this.packages)
        if(!this.tagFilters.has(this.selectedTag)) this.selectedTag = ""
      }
    }
    catch(error) {
      if(!signal.aborted) this.error = `The published widget catalog could not be loaded. ${String((error as Error).message ?? error)}`
    }
    finally { if(!signal.aborted) this.loading = false }
  }

  private onPopState = () => {
    if(this.wall) return
    this.dispatchEvent(new Event("package-page-change", {bubbles: true}))
    if(packageNameFromPath(location.pathname) || this.packages.length) void this.syncRoute()
    else {
      this.routeName = null
      void this.refresh()
    }
  }

  private async syncRoute() {
    const revision = ++this.routeRevision
    const name = this.routeName = packageNameFromPath(location.pathname)
    this.routeError = ""
    if(this.detail?.name === name) return
    this.closePreview()
    if(!name || this.wall) return
    const registry = this.registry
    let pkg = this.packages.find(pkg => pkg.name === name) ?? await registry.getLatestPackage(name).catch(() => null)
    if(!pkg && this.loading) {
      await this.catalogReady
      pkg = this.packages.find(pkg => pkg.name === name) ?? null
    }
    if(!this.isConnected || revision !== this.routeRevision || registry !== this.registry || packageNameFromPath(location.pathname) !== name) return
    if(pkg) this.openPreview(pkg)
    else this.routeError = "The package could not be loaded."
  }

  private openPreview(pkg: WebWriterPackage) {
    this.detail = pkg
    const members = previewMembers(pkg)
    const member = members.find(member => member.kind === "widget") ?? members[0]
    if(!member) return
    this.selected = {pkg, member}
    this.shared = false
    this.editing = true
    this.clearExampleCode()
    void this.loadPreview()
  }

  private followPackageLink(event: MouseEvent, href: string) {
    if(this.wall || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    event.preventDefault()
    if(location.pathname === href) return
    if(href === packageGalleryPath && history.state?.galleryReturn === true) history.back()
    else {
      if(href === packageGalleryPath) history.replaceState(null, "", href + location.search)
      else history.pushState({galleryReturn: location.pathname === packageGalleryPath}, "", href + location.search)
      this.onPopState()
    }
    if(href !== packageGalleryPath) void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLElement>("h1")?.focus())
  }

  private selectMember(pkg: WebWriterPackage, member: PackageMember) {
    if(this.selected?.member === member) {
      clearTimeout(this.editTimer)
      this.pendingCode = false
      this.codeParticipant = 0
      void this.loadPreview(this.exampleMarkup ?? undefined)
      return
    }
    this.selected = {pkg, member}
    this.clearExampleCode()
    void this.loadPreview()
  }

  private navigateMemberTabs(event: KeyboardEvent) {
    const list = event.currentTarget as HTMLElement
    const tabs = [...list.querySelectorAll<HTMLButtonElement>('button[role="tab"]')]
    const index = tabs.indexOf(event.target as HTMLButtonElement)
    if(index < 0) return

    let next: number
    switch(event.key) {
      case "Home": next = 0; break
      case "End": next = tabs.length - 1; break
      case "ArrowLeft":
      case "ArrowRight": {
        const forward = (event.key === "ArrowRight") !== (getComputedStyle(list).direction === "rtl")
        next = (index + (forward ? 1 : -1) + tabs.length) % tabs.length
        break
      }
      default: return
    }
    event.preventDefault()
    tabs[next].focus()
  }

  private closePreview = () => {
    this.previewRevision++
    clearTimeout(this.previewTimeout)
    this.clearFrames()
    this.clearExampleCode()
    this.selected = null
    this.detail = null
  }

  private clearExampleCode() {
    clearTimeout(this.editTimer)
    this.pendingCode = false
    this.codeEditor?.destroy()
    this.codeEditor = undefined
    this.codeVisible = false
    this.exampleMarkup = null
    this.documentMarkup = undefined
    this.codeParticipant = 0
  }

  private get codeLabel() { return t(this.selected?.member.kind === "snippet" ? "Snippet HTML" : "Widget HTML") }

  private get codeMarkup() {
    const frame = this.frames[this.codeParticipant]
    return (this.editing ? frame?.editableMarkup : undefined) ?? frame?.markup ?? this.documentMarkup ?? this.exampleMarkup
  }

  private updateCode() {
    const editor = this.codeEditor
    const markup = this.codeMarkup
    if(!editor || this.pendingCode || markup == null) return
    const previous = editor.state.doc.toString()
    if(previous === markup) return
    let from = 0, to = previous.length, end = markup.length
    while(from < Math.min(to, end) && previous[from] === markup[from]) from++
    while(to > from && end > from && previous[to - 1] === markup[end - 1]) {
      to--
      end--
    }
    editor.dispatch({changes: {from, to, insert: markup.slice(from, end)}, userEvent: "input.preview"})
  }

  private async toggleCode() {
    const selection = this.selected
    if(this.exampleMarkup === null) return
    if(this.codeVisible) {
      this.codeVisible = false
      return
    }
    this.codeVisible = true
    try {
      const {mountExampleHTMLEditor} = await import("../example-code-editor")
      await this.updateComplete
      if(selection !== this.selected || !this.codeVisible || this.exampleMarkup === null) return
      this.codeEditor ??= mountExampleHTMLEditor(this.renderRoot.querySelector<HTMLElement>(".preview-code-editor")!,
        this.codeMarkup ?? this.exampleMarkup, this.codeLabel, update => {
          clearTimeout(this.editTimer)
          const markup = update.state.doc.toString()
          this.pendingCode = true
          this.editTimer = setTimeout(() => {
            this.pendingCode = false
            void this.loadPreview(markup)
          }, previewEditDelay)
        })
      this.codeEditor.requestMeasure()
    }
    catch {
      if(selection === this.selected && this.codeVisible) {
        this.codeVisible = false
        this.previewError = "The HTML editor could not be loaded."
      }
    }
  }

  private async loadPreview(markup?: string) {
    const widget = this.selected
    if(!widget) return
    const revision = ++this.previewRevision
    const current = () => revision === this.previewRevision && this.isConnected
    clearTimeout(this.previewTimeout)
    this.clearFrames()
    this.previewError = ""
    this.previewStatus = "Loading example…"
    this.previewTimeout = setTimeout(() => {
      if(!current()) return
      this.previewRevision++
      this.clearFrames()
      this.previewStatus = ""
      this.previewError = "This widget took too long to load."
    }, 45_000)
    try {
      let content = markup
      if(content === undefined && widget.member.kind === "snippet") content = await this.registry.fetchSnippet(widget.member)
      if(content === undefined) {
        const first = widget.pkg.members.find(member => member.kind === "snippet")
        let published: string | null = null
        if(first) {
          try {
            const snippet = await this.registry.fetchSnippet(first)
            if(galleryExample(snippet, widget)) published = snippet
          }
          catch { /* An existing lesson or the widget's defaults remain available. */ }
        }
        const {galleryLessonExample} = await import("../gallery-examples")
        if(!current()) return
        const example = published ?? galleryLessonExample(widget)
        if(example === null && !widget.member.tagName) {
          throw new Error("The published example could not be downloaded.")
        }
        content = example ?? document.createElement(widget.member.tagName!).outerHTML
      }
      if(!current()) return
      const source = galleryDocument(content, widget.member.label)
      this.exampleMarkup ??= source.body.innerHTML
      this.documentMarkup = source.body.innerHTML
      this.updateCode()
      this.fitVideo = !!source.querySelector("webwriter-interactive-video")
      if(this.loading) {
        const localTags = new Set(widget.pkg.members.flatMap(member => member.tagName ? [member.tagName] : []))
        if([...source.body.getElementsByTagName("*")].some(element => element.localName.includes("-") && !localTags.has(element.localName))) {
          await this.catalogReady
          if(!current()) return
        }
      }
      const packages = galleryPreviewPackages(source, this.packages, widget.pkg)
      const key = packages.map(pkg => [pkg.name, pkg.version, ...pkg.scripts].join("\n")).sort().join("\n")
      let plan = this.dependencyPlans.get(key)
      if(!plan) {
        plan = resolvePackageDependencies(packages, location.href)
        this.dependencyPlans.set(key, plan)
        plan.catch(() => this.dependencyPlans.delete(key))
      }
      const {map} = await plan
      if(!current()) return
      const frameOrigin = editorFrameOrigin()
      const base = new URL(import.meta.env.BASE_URL, `${frameOrigin}/`)
      const entry = new URL(galleryPreviewEntryURL, base)
      if(widget.member.tagName && source.getElementsByTagName(widget.member.tagName).length) entry.searchParams.set("tag", widget.member.tagName)
      const network = packages.find(pkg => pkg.name === "@webwriter/network")
      if(network) entry.searchParams.set("network-version", network.version)
      const slides = packages.find(pkg => pkg.name === "@webwriter/slides")
      if(slides) entry.searchParams.set("slides-version", slides.version)
      const hash = packages.find(pkg => pkg.name === "@webwriter/hash")
      if(hash) entry.searchParams.set("hash-version", hash.version)
      const model = packages.find(pkg => pkg.name === "@webwriter/deep-learning-model")
      if(model) entry.searchParams.set("model-version", model.version)
      const tags = packages.flatMap(pkg => pkg.members.flatMap(member => member.kind === "widget" && member.tagName ? [member.tagName] : []))
      if(tags.length) entry.searchParams.set("tags", [...new Set(tags)].join(","))
      // Keep parent widgets disconnected until their child widget definitions exist.
      const staged = source.createElement("template")
      staged.id = "webwriter-gallery-content"
      staged.content.append(...source.body.childNodes)
      source.body.append(staged)
      this.createFrame = () => {
        const nonce = crypto.randomUUID()
        const html = previewFrameHTML(source.cloneNode(true) as Document, {
          bridgeNonce: nonce, packages, importMap: map,
          hostOrigin: location.origin, frameOrigin, entryURL: entry.href, executeScripts: true,
        })
        const url = new URL("frame-shell.html", base)
        url.searchParams.set("kind", "preview")
        url.searchParams.set("revision", String(revision))
        url.hash = new URLSearchParams({nonce}).toString()
        return {url: url.href, html, nonce, ready: false, height: 440}
      }
      this.previewStatus = "Loading widget…"
      this.frames = [this.createFrame()]
      this.addPeer()
    }
    catch(error) {
      if(!current()) return
      clearTimeout(this.previewTimeout)
      this.previewStatus = ""
      this.previewError = `The learner preview could not be loaded. ${String((error as Error).message ?? error)}`
    }
  }

  private clearFrames() {
    for(const frame of this.frames) clearTimeout(frame.timeout)
    this.frames = []
    this.createFrame = undefined
  }

  private addPeer() {
    if(!this.shared || !this.createFrame || this.frames.length !== 1) return
    const peer = this.createFrame()
    peer.timeout = setTimeout(() => {
      this.previewError = "The second preview took too long to load."
      this.setShared(false)
    }, 45_000)
    this.frames = [...this.frames, peer]
  }

  private setShared(shared: boolean) {
    if(this.shared === shared) return
    this.shared = shared
    if(shared) this.addPeer()
    else {
      clearTimeout(this.frames[1]?.timeout)
      this.frames = this.frames.slice(0, 1)
      this.codeParticipant = 0
    }
    this.configureFrames()
    this.updateCode()
  }

  private setEditing(editing: boolean) {
    if(this.editing === editing) return
    this.editing = editing
    const primary = this.frames[0]
    if(editing && primary?.markup !== undefined) this.documentMarkup = primary.markup
    this.configureFrames()
    const peer = this.frames[1]
    if(editing && peer?.ready && this.documentMarkup !== undefined && peer.markup !== this.documentMarkup) {
      this.postFrame(peer, {type: "gallery-preview-html", html: this.documentMarkup})
    }
    if(!editing) this.updateCode()
  }

  private frameElement(frame: GalleryFrame) {
    return this.renderRoot.querySelector<HTMLIFrameElement>(`iframe[data-frame="${frame.nonce}"]`)
  }

  private postFrame(frame: GalleryFrame, message: object) {
    this.frameElement(frame)?.contentWindow?.postMessage({...message, bridgeNonce: frame.nonce}, new URL(frame.url).origin)
  }

  private configureFrames() {
    for(const frame of this.frames) if(frame.ready) {
      this.postFrame(frame, {type: "gallery-preview-configure", editing: this.editing, shared: this.shared})
    }
    if(!this.editing && this.frames.length === 2 && this.frames.every(frame => frame.ready)) {
      this.postFrame(this.frames[0], {type: "gallery-preview-data-request"})
    }
  }

  private onMessage = (event: MessageEvent) => {
    const frame = this.frames.find(frame => event.data?.bridgeNonce === frame.nonce)
    if(!frame || event.source !== this.frameElement(frame)?.contentWindow || event.origin !== new URL(frame.url).origin) return
    if(event.data.type === "webwriter-frame-shell-ready" && event.data.kind === "preview"
      && event.data.revision === String(this.previewRevision) && frame.html) {
      this.postFrame(frame, {type: "webwriter-frame-document", html: frame.html})
      frame.html = ""
    }
    else if(event.data.type === "gallery-preview-ready") {
      if(frame.ready) return
      frame.ready = true
      clearTimeout(frame.timeout)
      if(frame === this.frames[0]) {
        clearTimeout(this.previewTimeout)
        this.previewStatus = ""
      }
      else if(this.documentMarkup !== undefined && this.documentMarkup !== this.exampleMarkup) {
        this.postFrame(frame, {type: "gallery-preview-html", html: this.documentMarkup})
      }
      this.configureFrames()
    }
    else if(event.data.type === "gallery-preview-error" || event.data.type === "webwriter-frame-error") {
      if(frame === this.frames[0]) {
        clearTimeout(this.previewTimeout)
        this.previewStatus = ""
      }
      else if(!frame.ready) this.setShared(false)
      this.previewError = `This published widget could not start. ${String(event.data.message ?? "Try another example.").slice(0, 400)}`
    }
    else if(event.data.type === "gallery-preview-height" && Number.isFinite(event.data.height)) {
      frame.height = Math.max(352, Math.min(900, event.data.height))
      this.requestUpdate()
    }
    else if(frame.ready && event.data.type === "gallery-preview-html" && event.data.editing === this.editing
      && event.data.shared === this.shared && typeof event.data.html === "string" && event.data.html.length <= exampleHTMLLimit) {
      const {html: markup, editableHTML, local} = event.data
      frame.markup = markup
      frame.editableMarkup = this.editing && typeof editableHTML === "string" && editableHTML.length <= exampleHTMLLimit ? editableHTML : undefined
      if(this.editing && local !== false && !this.pendingCode && markup !== this.documentMarkup) {
        this.documentMarkup = markup
        for(const peer of this.frames) if(frame !== peer && peer.ready) this.postFrame(peer, {type: "gallery-preview-html", html: markup})
      }
      this.updateCode()
    }
    else if(frame.ready && this.shared && !this.editing && event.data.type === "gallery-preview-data" && Array.isArray(event.data.changes)) {
      const changes = event.data.changes.slice(0, 128).filter((item: unknown) => Array.isArray(item)
        && typeof item[0] === "string" && item[0].length < 1024 && typeof item[1] === "string" && item[1].length <= 250_000)
      for(const peer of this.frames) if(frame !== peer && peer.ready) this.postFrame(peer, {type: "gallery-preview-data", changes})
    }
  }

  render() {
    if(this.routeName && !this.wall) return this.renderPackagePage()
    const tag = this.wall ? undefined : this.tagFilters.get(this.selectedTag)
    const selectedLanguage = this.wall ? "" : this.selectedLanguage
    const packages = galleryPackages(tag ? this.packages.filter(pkg => tag.packages.has(pkg.name)) : this.packages, this.query, selectedLanguage)
    const filtered = Boolean(tag || selectedLanguage || this.query.trim())
    const cards = html`<ul class="cards" aria-label=${t("Published widgets")}>${repeat(packages, pkg => pkg.name, pkg => this.wall ? html`
        <li><a class="widget-tile" data-card-overlay=${t("Show widget")} href=${packageGalleryURL(pkg.name) + location.search} aria-label=${t("Try {name}", {name: pkg.label})} title=${pkg.label}>${this.icon(pkg)}<span class="tile-label">${pkg.label}</span></a></li>` : html`
        <li><article>
          <div class="card-heading">
            ${this.icon(pkg)}<h3>${pkg.label}</h3>
            <a class="try" href=${packageGalleryURL(pkg.name) + location.search} aria-label=${t("Try {name}", {name: pkg.label})}
              @click=${(event: MouseEvent) => this.followPackageLink(event, packageGalleryURL(pkg.name))}>
              ${t("Try")}<span aria-hidden="true">${unsafeSVG(arrowRightIcon)}</span>
            </a>
          </div>
          <p class="package">${pkg.name} · ${pkg.version}</p>
          <p class="description">${pkg.description || t("Explore {name} in a learning activity.", {name: pkg.label})}</p>
          ${this.renderPackageKeywords(pkg, "card")}
        </article></li>`)}
      </ul>`
    return html`
      ${!this.wall ? html`<search class="filters">
        <div class="search-row">
          <label class="search">${t("Search widgets")}<input type="search" placeholder=${t("Name, topic, or package")} .value=${this.query} @input=${(event: Event) => this.query = (event.target as HTMLInputElement).value}></label>
          <button type="button" ?disabled=${this.loading} @click=${() => this.refresh()}>${this.loading ? t("Loading…") : t("Refresh")}</button>
        </div>
        ${this.renderTagFilters()}
      </search>` : nothing}
      ${this.error ? html`<p class="error" role="alert">${this.error.startsWith("The published widget catalog could not be loaded. ") ? html`${t("The published widget catalog could not be loaded.")} ${this.error.slice("The published widget catalog could not be loaded. ".length)}` : t(this.error)}${this.wall ? html` <a href=${packageGalleryPath}>${t("Explore the widgets →")}</a>` : nothing}</p>` : nothing}
      ${!this.wall || this.loading ? html`<p class="count" role="status">${this.loading ? t("Loading published widgets…") : html`${packages.length}${filtered ? html` ${t("of {total}", {total: this.packages.length})}` : nothing} ${!filtered && packages.length === 1 ? t("package") : t("packages")}`}</p>` : nothing}
      ${cards}
      ${!this.loading && !packages.length && !this.error ? html`<p class="empty">${filtered ? t("No widgets match your search.") : t("No published widgets were found.")}</p>` : nothing}
    `
  }

  private renderTagFilters() {
    const locale = language()
    const languages = galleryLanguageOptions(locale)
    const options = Array.from(this.tagFilters, ([key, tag]) => ({key, ...tag}))
    const byCode = (a: typeof options[number], b: typeof options[number]) => a.keyword.localeCompare(b.keyword)
    const levels = options.filter(option => option.kind === "level" && extraEducationLevelIndex(option) < 0).sort(byCode)
    const extraLevels = options.filter(option => extraEducationLevelIndex(option) >= 0)
      .sort((a, b) => extraEducationLevelIndex(a) - extraEducationLevelIndex(b))
    const fields = options.filter(option => option.kind === "field").sort(byCode)
    const others = options.filter(option => option.kind !== "level" && option.kind !== "field")
      .sort((a, b) => onlineOnlyLast(a, b) || a.label.localeCompare(b.label, locale))
    const buttons = (tags: typeof options, extra = false) => repeat(tags, option => option.key, option => html`
      <button type="button" class="keyword-badge tag-filter" data-kind=${option.kind} ?data-extra-education-level=${extra}
        aria-pressed=${this.selectedTag === option.key}
        @click=${() => {
          this.selectedLanguage = ""
          this.selectedTag = this.selectedTag === option.key ? "" : option.key
        }}>
        ${this.keywordIcon(option.icon)}
        <span>${option.label}</span>
      </button>`)
    return html`<fieldset class="tag-filters">
      <legend>${t("Filter by tag")}</legend>
      <div class="tag-options">
        <span class=${this.selectedLanguage ? "language-filter active" : "language-filter"}>
          ${this.keywordIcon("KeywordLanguage")}
          <select class="keyword-badge" data-kind="language" name="package-language" aria-label=${t("Language")}
            @change=${(event: Event) => {
              this.selectedTag = ""
              this.selectedLanguage = (event.target as HTMLSelectElement).value
            }}>
            <option value="" .selected=${!this.selectedLanguage}>${t("Language")}</option>
            ${repeat(languages, option => option.code, option => html`<option value=${option.code} .selected=${this.selectedLanguage === option.code}>${option.label}</option>`)}
          </select>
        </span>
        ${buttons(others)}
      </div>
      ${levels.length || extraLevels.length ? html`<div class="tag-options" role="group" aria-label=${t("Level of education")}>
        ${buttons(levels)}
        ${this.moreTagsOpen ? buttons(extraLevels, true) : extraLevels.length ? html`
          <button type="button" class="more-tag-filters-toggle" @click=${async () => {
            this.moreTagsOpen = true
            await this.updateComplete
            this.renderRoot.querySelector<HTMLButtonElement>("[data-extra-education-level]")?.focus()
          }}>${t("Show more…")}</button>` : nothing}
      </div>` : nothing}
      ${fields.length ? html`<div class="tag-options" role="group" aria-label=${t("Field of education")}>${buttons(fields)}</div>` : nothing}
    </fieldset>`
  }

  private keywordIcon(icon?: string) {
    return icon ? html`<span class="keyword-icon" aria-hidden="true">${ribbonIcon(icon)}</span>` : nothing
  }

  private renderPackageKeywords(pkg: WebWriterPackage, placement: "card" | "details") {
    const selected = this.tagFilters.get(this.selectedTag)
    const selectedLevel = selected && extraEducationLevels[extraEducationLevelIndex(selected)]
    const keywords = packageKeywordPresentations(pkg.keywords, language(), navigator.languages)
      .filter(keyword => keyword.kind !== "widget" && (placement === "details" || keyword.kind !== "custom"))
      .filter(keyword => extraEducationLevelIndex(keyword) < 0 || keyword.label === selectedLevel?.label)
    if(selectedLevel && selected?.packages.has(pkg.name) && !keywords.some(keyword => keyword.kind === "level" && keyword.label === selectedLevel.label)) {
      keywords.push(selectedLevel)
    }
    keywords.sort(onlineOnlyLast)
    return keywords.length ? html`<ul class="keyword-list ${placement}-keywords" role="list" aria-label=${t("Package tags")}>
      ${keywords.map(keyword => html`<li class="keyword-badge ${placement}-keyword" data-kind=${keyword.kind}>
        ${this.keywordIcon(keyword.icon)}
        <span>${keyword.label}</span>
        ${keyword.additionalLanguages?.length ? html`<span title=${keyword.additionalLanguages.join(", ")}>+${keyword.additionalLanguages.length}</span>` : nothing}
      </li>`)}
    </ul>` : nothing
  }

  private icon(pkg: WebWriterPackage) {
    return pkg.iconUrl ? html`<img class="icon" src=${pkg.iconUrl} alt="" loading="lazy" @error=${(event: Event) => (event.target as HTMLImageElement).hidden = true}>`
      : html`<span class="icon placeholder" aria-hidden="true">${pkg.label.charAt(0)}</span>`
  }

  private renderPackagePage() {
    const pkg = this.detail
    const selection = this.selected
    const members = pkg ? previewMembers(pkg) : []
    return html`<article class="package-page" aria-labelledby="preview-title">
      <header class="preview-heading">
        <div class="details-heading">
          <div class="details-leading">
            <a class="icon-button package-back" href=${packageGalleryPath + location.search} aria-label=${t("Back to gallery")} title=${t("Back to gallery")}
              @click=${(event: MouseEvent) => this.followPackageLink(event, packageGalleryPath)}>
              <span aria-hidden="true">${unsafeSVG(chevronLeftIcon)}</span>
            </a>
            ${pkg ? this.icon(pkg) : nothing}
          </div>
          <div>
            <div class="details-title">
              <h1 id="preview-title" tabindex="-1">${pkg?.label ?? this.routeName}</h1>
              ${pkg ? html`<a class="details-subheading" href=${npmPackageURL(pkg.name)} target="_blank" rel="noopener noreferrer">${pkg.name}@${pkg.version}</a>` : nothing}
            </div>
            ${pkg && (pkg.authors.length || pkg.license) ? html`<div class="details-byline">
              ${pkg.authors.length ? html`<p class="details-authors">${t("By {authors}", {authors: pkg.authors.join(", ")})}</p>` : nothing}
              ${pkg.license ? html`<p class="details-license">${t("License: {license}", {license: pkg.license})}</p>` : nothing}
            </div>` : nothing}
          </div>
        </div>
        ${pkg?.description ? html`<p class="details-description">${pkg.description}</p>` : nothing}
        ${pkg ? this.renderPackageKeywords(pkg, "details") : nothing}
      </header>
      ${this.routeError ? html`<p class="error" role="alert">${t(this.routeError)}</p>`
        : !pkg ? html`<p class="status" role="status">${t("Loading…")}</p>`
        : !selection ? html`<p>${t("This package has no available examples.")}</p>` : html`
        <section class=${this.codeVisible ? "preview-viewer code-open" : "preview-viewer"} aria-label=${t("Package preview")}>
          <div class="preview-tab-row">
            <button class="preview-tab-arrow preview-tab-left" type="button" ?hidden=${!this.tabsOverflow}
              aria-label=${t("Scroll tabs left")} aria-disabled=${String(!this.tabsCanScrollLeft)} @click=${() => this.scrollTabs(-1)}>
              <span aria-hidden="true">${unsafeSVG(chevronLeftIcon)}</span>
            </button>
            <div class="preview-tab-scrollport" @scroll=${this.updateTabScroll}>
              <div class="preview-members" role="tablist" aria-label=${t("Widget or snippet")} @keydown=${this.navigateMemberTabs}>
                ${repeat(members, member => member.id, (member, index) => html`<button type="button" role="tab" id=${`preview-tab-${index}`}
                  aria-selected=${String(member === selection.member)} tabindex=${member === selection.member ? 0 : -1}
                  title=${member === selection.member ? t("Reset example") : member.label}
                  @click=${() => this.selectMember(selection.pkg, member)}>${member.label}</button>`)}
              </div>
            </div>
            <button class="preview-tab-arrow preview-tab-right" type="button" ?hidden=${!this.tabsOverflow}
              aria-label=${t("Scroll tabs right")} aria-disabled=${String(!this.tabsCanScrollRight)} @click=${() => this.scrollTabs(1)}>
              <span aria-hidden="true">${unsafeSVG(chevronRightIcon)}</span>
            </button>
          </div>
          ${this.previewStatus ? html`<p class="status preview-status" role="status">${t(this.previewStatus)}</p>` : nothing}
          ${this.previewError ? html`<p class="error preview-error" role="alert">${this.previewError.startsWith("The learner preview could not be loaded. ") ? t("The learner preview could not be loaded. {message}", {message: this.translateKnownPreviewError(this.previewError.slice("The learner preview could not be loaded. ".length))}) : this.previewError.startsWith("This published widget could not start. ") ? t("This published widget could not start. {message}", {message: this.translateKnownPreviewError(this.previewError.slice("This published widget could not start. ".length))}) : t(this.previewError)}</p>` : nothing}
          <div class=${this.codeVisible ? "preview-panes with-code" : "preview-panes"} role="tabpanel"
            aria-labelledby=${`preview-tab-${members.indexOf(selection.member)}`} tabindex=${this.frames.length ? nothing : 0}>
            <div class="preview-participants">${repeat(this.frames, frame => frame.nonce, (frame, index) => {
              const title = this.shared ? t("Participant {number}", {number: index + 1}) : t("{name}: preview", {name: selection.member.label})
              return html`<div class="preview-participant">
                ${this.shared ? html`<h3>${title}</h3>` : nothing}
                <iframe title=${title} data-frame=${frame.nonce} src=${frame.url} style=${this.fitVideo ? "height: 70dvh" : `height: ${frame.height}px`} sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" allow="fullscreen"></iframe>
              </div>`
            })}</div>
            <section id="preview-code" class="preview-code" aria-labelledby="preview-code-title" ?hidden=${!this.codeVisible}>
              <div class="preview-code-header">
                <h3 id="preview-code-title">${this.codeLabel}</h3>
                ${this.shared ? html`<select aria-label=${t("Preview participants")} .value=${String(this.codeParticipant)}
                  @change=${(event: Event) => {
                    this.codeParticipant = Number((event.target as HTMLSelectElement).value)
                    this.updateCode()
                  }}>
                  <option value="0">${t("Participant {number}", {number: 1})}</option>
                  <option value="1">${t("Participant {number}", {number: 2})}</option>
                </select>` : nothing}
              </div>
              <div class="preview-code-editor"></div>
            </section>
          </div>
          <div class="preview-toolbar">
            <div class="preview-modes">
              <div role="group" aria-label=${t("Preview participants")}>
                <button type="button" aria-pressed=${String(!this.shared)} @click=${() => this.setShared(false)}>${t("Single")}</button>
                <button type="button" aria-pressed=${String(this.shared)} @click=${() => this.setShared(true)}>${t("Shared")}</button>
              </div>
              <div role="group" aria-label=${t("Preview mode")}>
                <button type="button" aria-pressed=${String(this.editing)} @click=${() => this.setEditing(true)}>${t("Editing")}</button>
                <button type="button" aria-pressed=${String(!this.editing)} @click=${() => this.setEditing(false)}>${t("Reading")}</button>
              </div>
            </div>
            <button class="icon-button preview-code-toggle" type="button" aria-label=${t("Code")} title=${t("Code")}
              aria-expanded=${String(this.codeVisible)} aria-controls="preview-code"
              ?disabled=${this.exampleMarkup === null} @click=${this.toggleCode}><span aria-hidden="true">${unsafeSVG(codeIcon)}</span></button>
          </div>
        </section>
      `}
    </article>`
  }

  private translateKnownPreviewError(message: string) {
    return ["Try another example.", "The published example could not be downloaded."]
      .includes(message) ? t(message) : message
  }
}

if(!customElements.get("widget-gallery")) customElements.define("widget-gallery", WidgetGallery)
