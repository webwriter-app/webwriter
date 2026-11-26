import "./float-info"
import { LitElement, css, html, nothing } from "lit"
import "./ribbon-menu"
import type {RibbonMenu, RibbonMenuButton} from "./ribbon-menu"
import { repeat } from "lit/directives/repeat.js"
import { ribbonIcon } from "../ribbon-icons"
import type { SelectionGap, SelectionPathItem, SelectionPathSection } from "../editor-bridge"
import {createAnchorPositioner} from "../anchor-positioning.js"
import {popupAnchorCSS} from "./popup-position"

export type DocumentTreeItem = SelectionPathItem & {
  children: DocumentTreeItem[]
}

export type BreadcrumbSelection<T extends SelectionPathItem | SelectionPathSection> = T & {
  openToolbox?: boolean
}

type BreadcrumbEntry = {
  key: string
  kind: "item" | "separator"
  item: SelectionPathItem
  state: "visible" | "entering"
  fillDocument?: boolean
}

type TreeIndex = {items: Map<string, DocumentTreeItem>, sections: Map<string, SelectionPathSection>}

/** Path lookups per tree instance. Item paths are authored node paths, not
 * child indices of the outline, so they cannot be followed from the root.
 * Hosts replace the tree object when the outline changes; an index therefore
 * never outlives the tree it describes. */
const treeIndexes = new WeakMap<DocumentTreeItem, TreeIndex>()

function treeIndex(tree: DocumentTreeItem) {
  let index = treeIndexes.get(tree)
  if(index) return index
  const items = new Map<string, DocumentTreeItem>(), sections = new Map<string, SelectionPathSection>()
  // Depth first, keeping the first match, as a search from the root finds it.
  const visit = (item: DocumentTreeItem) => {
    const key = item.path.join(".")
    if(!items.has(key)) items.set(key, item)
    for(const section of item.sections ?? []) {
      const key = section.path.join(".")
      if(!sections.has(key)) sections.set(key, section)
    }
    item.children.forEach(visit)
  }
  visit(tree)
  treeIndexes.set(tree, index = {items, sections})
  return index
}

/** A compact, clickable path for the element containing the current selection. */
export class DomEditorBreadcrumb extends LitElement {
  static properties = {
    path: {attribute: false},
    fillElement: {attribute: false},
    showPositionIcons: {attribute: false},
    nodeSelected: {type: Boolean, attribute: "node-selected", reflect: true},
    capture: {type: Boolean, reflect: true},
    gap: {attribute: false},
    selectedSectionPath: {attribute: false},
    tree: {attribute: false},
    pathItems: {attribute: false},
    breadcrumbEntries: {attribute: false, state: true},
    breadcrumbCollapseCount: {attribute: false, state: true},
    treeOpen: {attribute: "tree-open", type: Boolean, reflect: true},
    treeRootPath: {attribute: false, state: true},
  }

  static styles = css`
    :host {
      box-sizing: border-box;
      display: block;
      flex: 0 0 30px;
      width: 100%;
      height: 30px;
      min-height: 30px;
      max-height: 30px;
      color: #465465;
      border-bottom: 0.5px solid #a8a8a8;
      background: #ededed;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      overflow: hidden;
    }

    nav {
      box-sizing: border-box;
      width: 100%;
      height: 30px;
      overflow: hidden;
    }

    ol {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      width: 100%;
      min-width: 0;
      height: 30px;
      margin: 0;
      padding: 0 var(--breadcrumb-inline-end-space, 0.35rem) 0 0.35rem;
      list-style: none;
      white-space: nowrap;
      overflow: hidden;
    }

    .breadcrumb-list > li {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      min-width: 0;
      height: 30px;
    }

    @keyframes breadcrumb-fade-in {
      from {opacity: 0;}
      to {opacity: 1;}
    }

    .breadcrumb-fade-in {
      animation: var(--ww-ui-animation, breadcrumb-fade-in 120ms ease both);
    }

    .separator {
      display: inline-flex;
      justify-content: center;
      margin: 0 0.25rem;
      color: #8a96a5;
      user-select: none;
    }

    .separator-trigger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 28px;
      margin: 0;
      padding: 0;
      border: 0;
      border-radius: 0.2rem;
      color: inherit;
      background: transparent;
      cursor: pointer;
    }

    .separator-trigger:hover {
      color: #243447;
      background: #e8eef5;
    }

    .separator-trigger:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -1px;
    }

    .separator-trigger[aria-expanded="true"] .separator-icon {
      transform: rotate(90deg);
    }

    .separator-icon {
      display: inline-flex;
      width: 13px;
      height: 13px;
    }

    .separator-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .separator.fill-document { margin-inline: 0; }
    .fill-document > .item { padding-inline: .125rem; }
    .fill-document > .separator-trigger { width: 16px; }
    .separator-equals { align-items: center; justify-content: center; font: 14px/1 system-ui; }
    .separator-equals::before { content: "=" / ""; }
    .separator-trigger[aria-expanded="true"] .separator-equals { transform: none; }

    .item {
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
      height: 28px;
      margin: 0;
      padding: 0 0.25rem;
      border: 0;
      border-radius: 0.2rem;
      color: inherit;
      font: 11px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: transparent;
      cursor: pointer;
    }

    .item:hover {
      color: #243447;
      background: #e8eef5;
    }

    .item:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -1px;
    }

    .item.icon-only .item-label {
      display: none;
    }

    @media (pointer: coarse) {
      .breadcrumb-list {
        overflow-x: auto;
        scrollbar-width: none;
      }
    }

    .position-icons {
      display: inline-flex;
      flex: 0 0 auto;
      align-items: center;
      gap: 1px;
      margin-left: -0.1rem;
      color: var(--sl-color-primary-500, #0ea5e9);
      line-height: 1;
      transform: translateY(-4px);
    }

    .position-icon,
    .position-icon svg {
      display: block;
      width: 10px;
      height: 10px;
    }

    .position-balloon-pinned svg {
      transform: scale(1.2);
    }

    .position-float,
    .position-float svg {
      width: 16px;
      height: 16px;
    }

    .image-hotspot-indicator,
    .image-hotspot-indicator svg {
      display: block;
      width: 16px;
      height: 16px;
    }

    .image-hotspot-indicator {
      flex: 0 0 16px;
      margin-left: 0.05rem;
      color: #526b86;
      transform: translateY(2px);
    }

    .item-sections {
      display: inline-flex;
      align-items: flex-start;
      gap: 0.1rem;
      margin-left: -0.15rem;
      padding-right: 0.15rem;
    }

    .section-item {
      display: inline-flex;
      align-items: center;
      gap: 0.15rem;
      align-self: flex-start;
      min-width: 0;
      height: 16px;
      margin: 1px 0 0;
      padding: 0 0.12rem;
      border: 0;
      border-radius: 0.15rem;
      color: #64748b;
      background: transparent;
      font: 600 8px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      cursor: pointer;
      transform: translateY(-1px);
    }

    .section-item:hover {
      color: #243447;
      background: #dbe7f2;
    }

    .section-item:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -1px;
    }

    .section-item.section-selected {
      color: #174f87;
      text-decoration: underline;
      text-decoration-color: var(--sl-color-primary-400, #38bdf8);
      text-decoration-style: dotted;
      text-decoration-thickness: 1.5px;
      text-underline-offset: 2px;
    }

    .item.node-selected .item-label {
      text-decoration: underline;
      text-decoration-color: var(--sl-color-primary-400, #38bdf8);
      text-decoration-style: dotted;
      text-decoration-thickness: 2px;
      text-underline-offset: 3px;
    }

    .item.capture-selected .item-label {
      text-decoration: underline;
      text-decoration-color: var(--sl-color-primary-400, #38bdf8);
      text-decoration-style: solid;
      text-decoration-thickness: 2px;
      text-underline-offset: 3px;
    }

    .item.icon-only {
      position: relative;
    }

    .item.icon-only.node-selected::after,
    .item.icon-only.capture-selected::after {
      position: absolute;
      right: 0.25rem;
      bottom: 1px;
      left: 0.25rem;
      border-bottom: 2px dotted var(--sl-color-primary-400, #38bdf8);
      content: "";
    }

    .item.icon-only.capture-selected::after {
      border-bottom-style: solid;
    }

    .item-icon {
      position: relative;
      display: inline-flex;
      flex: 0 0 13px;
      width: 13px;
      height: 13px;
      color: #526b86;
    }

    .item-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .item-icon.image-icon svg {
      visibility: hidden;
    }

    .item-icon[data-package-icon] { filter: grayscale(1); }

    .item-icon img {
      position: absolute;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

  `

  path: SelectionPathItem[] = []
  /** Keep the document's filled element reachable when only Document is selected. */
  fillElement: SelectionPathItem | null = null
  showPositionIcons = true
  nodeSelected = false
  capture = false
  gap: SelectionGap | null = null
  selectedSectionPath: number[] | null = null
  /** The whole outline, shown by the outline popup. */
  tree: DocumentTreeItem | null = null
  /** Outline items for the entries of `path`: their sections, and whether they
   * have children. A host that builds `tree` only while the outline is open
   * supplies these instead; without them the entries are looked up in `tree`. */
  pathItems: DocumentTreeItem[] | null = null
  private breadcrumbEntries: BreadcrumbEntry[] = []
  treeOpen = false
  private treeRootPath: number[] = []
  private menuAnchor: HTMLButtonElement | null = null
  private anchorPositioner = createAnchorPositioner(document)
  private hoveredPath: number[] | null = null
  private hoveredSectionPath: number[] | null = null
  private breadcrumbCollapseCount = 0
  private breadcrumbResizeObserver: ResizeObserver | undefined
  private responsiveLayoutQueued = false

  private readonly handleWindowResize = () => {
    this.collapseTree()
    this.scheduleResponsiveLayout()
  }

  private get displayPath() {
    const selected = this.path.length
      ? this.path
      : [{path: [], name: "Document", icon: "Document"}]
    const source = selected.length === 1 && !selected[0].path.length && this.fillElement
      ? [...selected, this.fillElement] : selected
    const path = source[0]?.fillViewport && source[0].path.length
      ? [{path: [], name: "Document", icon: "Document"}, ...source] : source
    return path.map(item => {
      const treeSections = this.pathTreeItem(item.path)?.sections ?? []
      if(!treeSections.length) return item
      const sections = [...(item.sections ?? [])]
      const paths = new Set(sections.map(section => this.pathKey(section.path)))
      treeSections.forEach(section => {
        if(!paths.has(this.pathKey(section.path))) sections.push(section)
      })
      return {...item, sections}
    })
  }

  private desiredBreadcrumbEntries() {
    const path = this.displayPath
    const entries: BreadcrumbEntry[] = []
    for(const [index, item] of path.entries()) {
      const fillDocument = Boolean(item.fillViewport || index === 0 && path[index + 1]?.fillViewport)
      entries.push({
        key: `item:${this.pathKey(item.path)}`,
        kind: "item",
        item,
        state: "visible",
        fillDocument,
      })
      if(index < path.length - 1 || this.itemHasChildren(item)) {
        entries.push({
          key: `separator:${this.pathKey(item.path)}`,
          kind: "separator",
          item,
          state: "visible",
          fillDocument: index === 0 && Boolean(path[index + 1]?.fillViewport),
        })
      }
    }
    return entries
  }

  private breadcrumbEntriesEqual(first: BreadcrumbEntry[], second: BreadcrumbEntry[]) {
    return first.length === second.length && first.every((entry, index) => {
      const other = second[index]
      return entry.key === other.key
        && entry.kind === other.kind
        && entry.state === other.state
        && entry.fillDocument === other.fillDocument
        && entry.item.name === other.item.name
        && entry.item.targetId === other.item.targetId
        && entry.item.targetSelected === other.item.targetSelected
        && entry.item.icon === other.item.icon
        && entry.item.iconUrl === other.item.iconUrl
        && entry.item.imageMap === other.item.imageMap
        && entry.item.fillViewport === other.item.fillViewport
        && entry.item.position === other.item.position
        && entry.item.positionAnchor === other.item.positionAnchor
        && entry.item.float === other.item.float
        && entry.item.floatForcedRight === other.item.floatForcedRight
        && entry.item.floatRightInFlow === other.item.floatRightInFlow
        && this.sectionsEqual(entry.item.sections, other.item.sections)
        && this.pathsEqual(entry.item.path, other.item.path)
    })
  }

  private sectionsEqual(first: SelectionPathSection[] | undefined, second: SelectionPathSection[] | undefined) {
    if(first === second) return true
    if(!first || !second || first.length !== second.length) return false
    return first.every((section, index) => {
      const other = second[index]
      return section.type === other.type
        && section.name === other.name
        && section.icon === other.icon
        && section.fillViewport === other.fillViewport
        && section.position === other.position
        && section.positionAnchor === other.positionAnchor
        && section.float === other.float
        && section.floatForcedRight === other.floatForcedRight
        && section.floatRightInFlow === other.floatRightInFlow
        && this.pathsEqual(section.path, other.path)
    })
  }

  private syncBreadcrumbEntries() {
    const desired = this.desiredBreadcrumbEntries()
    const existingByKey = new Map(this.breadcrumbEntries.map(entry => [entry.key, entry]))
    const next = desired.map(entry => {
      const existing = existingByKey.get(entry.key)
      return existing
        ? {
            ...entry,
            state: existing.state,
          }
        : {...entry, state: "entering" as const}
    })

    if(!this.breadcrumbEntriesEqual(this.breadcrumbEntries, next)) {
      this.breadcrumbEntries = next
    }
  }

  private pathKey(path: number[]) {
    return path.join(".")
  }

  private pathsEqual(first: number[], second: number[]) {
    return first.length === second.length && first.every((index, position) => index === second[position])
  }

  private treeItemAtPath(path: number[]) {
    return this.tree ? treeIndex(this.tree).items.get(this.pathKey(path)) ?? null : null
  }

  private pathTreeItem(path: number[]) {
    if(!this.pathItems) return this.treeItemAtPath(path)
    return this.pathItems.find(item => this.pathsEqual(item.path, path)) ?? null
  }

  private itemHasChildren(item: SelectionPathItem) {
    const treeItem = this.pathTreeItem(item.path)
    return Boolean(treeItem && treeItem.children.length > 0)
  }

  private selectedPath() {
    return this.path[this.path.length - 1]?.path ?? null
  }

  private isSelected(item: SelectionPathItem) {
    const selected = this.selectedPath()
    return selected !== null
      && selected.length === item.path.length
      && selected.every((index, position) => index === item.path[position])
  }

  private isNodeSelected(item: SelectionPathItem) {
    return this.nodeSelected && this.isSelected(item)
  }

  private isCaptured(path: number[]) {
    const selected = this.selectedPath()
    return this.capture && selected !== null && this.pathsEqual(selected, path)
  }

  protected willUpdate(changedProperties: Map<PropertyKey, unknown>) {
    if(changedProperties.has("path") || changedProperties.has("fillElement") || changedProperties.has("tree") || changedProperties.has("pathItems") || changedProperties.has("treeOpen")) {
      this.syncBreadcrumbEntries()
    }
  }

  protected updated(changedProperties: Map<PropertyKey, unknown>) {
    if(this.hoveredPath && !this.hasRenderedItem(this.hoveredPath)) {
      this.clearHover()
    }

    if(changedProperties.has("path")
      || changedProperties.has("tree")
      || changedProperties.has("pathItems")
      || changedProperties.has("treeOpen")
      || changedProperties.has("breadcrumbEntries")) {
      this.scheduleResponsiveLayout()
    }
  }

  connectedCallback() {
    super.connectedCallback()
    window.addEventListener("resize", this.handleWindowResize)
    this.observeBreadcrumbNav()
    this.scheduleResponsiveLayout()
  }

  protected firstUpdated() {
    this.observeBreadcrumbNav()
    this.scheduleResponsiveLayout()
  }

  private observeBreadcrumbNav() {
    if(this.breadcrumbResizeObserver || typeof ResizeObserver === "undefined") return
    const nav = this.renderRoot.querySelector<HTMLElement>("nav")
    if(nav) {
      this.breadcrumbResizeObserver = new ResizeObserver(() => this.scheduleResponsiveLayout())
      this.breadcrumbResizeObserver.observe(nav)
    }
  }

  private scheduleResponsiveLayout() {
    if(this.responsiveLayoutQueued) return
    this.responsiveLayoutQueued = true
    queueMicrotask(() => {
      this.responsiveLayoutQueued = false
      this.updateResponsiveLayout()
    })
  }

  private measuredBreadcrumbWidth(list: HTMLElement) {
    return Array.from(list.children).reduce((width, child) => {
      const element = child as HTMLElement
      const style = getComputedStyle(element)
      const margin = (Number.parseFloat(style.marginLeft) || 0)
        + (Number.parseFloat(style.marginRight) || 0)
      return width + element.getBoundingClientRect().width + margin
    }, 0)
  }

  private updateResponsiveLayout() {
    const list = this.renderRoot.querySelector<HTMLElement>(".breadcrumb-list")
    if(!list) return

    const listStyle = getComputedStyle(list)
    const padding = (Number.parseFloat(listStyle.paddingLeft) || 0)
      + (Number.parseFloat(listStyle.paddingRight) || 0)
    const availableWidth = list.clientWidth - padding
    if(availableWidth <= 0) return

    const items = Array.from(list.querySelectorAll<HTMLElement>(".breadcrumb-entry"))
      .filter(item => !item.classList.contains("separator"))
    const collapsedClass = "icon-only"
    items.forEach(item => item.querySelector(".item")?.classList.remove(collapsedClass))

    let requiredWidth = this.measuredBreadcrumbWidth(list)
    let collapseCount = 0
    if(requiredWidth > availableWidth + 0.5) {
      const expandedWidths = items.map(item => item.getBoundingClientRect().width)
      items.forEach(item => item.querySelector(".item")?.classList.add(collapsedClass))
      const collapsedWidths = items.map(item => item.getBoundingClientRect().width)
      for(let index = 0; index < items.length && requiredWidth > availableWidth + 0.5; index++) {
        if(!items[index].querySelector(".item")) continue
        requiredWidth -= expandedWidths[index] - collapsedWidths[index]
        collapseCount++
      }
    }

    items.forEach((item, index) => {
      item.querySelector(".item")?.classList.toggle(collapsedClass, index < collapseCount)
    })

    if(this.breadcrumbCollapseCount !== collapseCount) {
      this.breadcrumbCollapseCount = collapseCount
    }
    if(requiredWidth > availableWidth + 0.5 && list.querySelector(".item[aria-pressed]")) {
      list.scrollLeft = listStyle.direction === "rtl" ? -list.scrollWidth : list.scrollWidth
    }
  }

  private readonly handlePointerDown = (event: PointerEvent) => {
    if(event.button !== 0) return

    // Keep the editor iframe as the active element while the breadcrumb is
    // used with a pointer. The click event still performs the breadcrumb action.
    event.preventDefault()
  }

  private hasRenderedItem(path: number[]) {
    if(this.treeOpen && this.treeItemAtPath(path)) return true
    const key = path.join(",")
    return Array.from(this.renderRoot.querySelectorAll<HTMLElement>("[data-path]"))
      .some(item => item.dataset.path === key)
  }

  private dispatchHover(item: SelectionPathItem | null) {
    this.dispatchEvent(new CustomEvent<SelectionPathItem | null>("breadcrumb-item-hover", {
      detail: item
        ? {
            path: [...item.path],
            name: item.name,
            ...(item.icon ? {icon: item.icon} : {}),
            ...(item.iconUrl ? {iconUrl: item.iconUrl} : {}),
          }
        : null,
      bubbles: true,
      composed: true,
    }))
  }

  private hover(item: SelectionPathItem) {
    this.hoveredPath = [...item.path]
    this.dispatchHover(item)
  }

  private clearHover(item?: SelectionPathItem) {
    if(this.hoveredPath === null) return
    if(item && !this.pathsEqual(this.hoveredPath, item.path)) return
    this.hoveredPath = null
    this.dispatchHover(null)
  }

  collapseTree() {
    this.clearHover()
    this.dispatchSectionHover(null)
    if(!this.treeOpen) return
    const menu = this.renderRoot.querySelector<RibbonMenu>("#document-tree")
    if(menu) this.anchorPositioner.release(menu)
    const path = [...this.treeRootPath]
    menu?.closeSubmenus()
    if(menu?.matches(":popover-open")) menu.hidePopover()
    this.treeOpen = false
    this.treeRootPath = []
    this.menuAnchor = null
    this.dispatchTreeToggle(false, path)
  }

  private dispatchTreeToggle(open: boolean, path: number[]) {
    this.dispatchEvent(new CustomEvent("breadcrumb-tree-toggle", {
      detail: {open, path: [...path]}, bubbles: true, composed: true,
    }))
  }

  private toggleTree(item: SelectionPathItem, anchor: HTMLButtonElement) {
    if(this.treeOpen && this.pathsEqual(this.treeRootPath, item.path)) {
      this.collapseTree()
      return
    }
    this.collapseTree()
    this.treeRootPath = [...item.path]
    this.menuAnchor = anchor
    this.treeOpen = true
    this.dispatchTreeToggle(true, item.path)
    void this.updateComplete.then(async () => {
      const menu = this.renderRoot.querySelector<RibbonMenu>("#document-tree")
      if(!this.treeOpen || this.menuAnchor !== anchor || !menu || !anchor.isConnected) return
      await menu.updateComplete
      if(!this.treeOpen || this.menuAnchor !== anchor || !menu.isConnected) return
      if(typeof menu.showPopover === "function") menu.showPopover()
      this.anchorPositioner.bind(menu, anchor, popupAnchorCSS())
      this.anchorPositioner.refresh()
      menu.shadowRoot?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    })
  }

  private outlineButtons(items: DocumentTreeItem[]): RibbonMenuButton[] {
    return items.map(item => ({
      label: item.name,
      action: `outline:${item.path.join(",")}`,
      icon: item.icon ?? item.name,
      iconUrl: item.iconUrl,
      selected: this.isSelected(item) || this.isCaptured(item.path),
      submenu: [
        ...(item.sections ?? []).map(section => ({
          label: section.name, icon: section.icon,
          action: `outline-section:${section.path.join(",")}`,
          selected: this.isSectionSelected(section),
        })),
        ...this.outlineButtons(item.children),
      ],
    }))
  }

  private outlineTarget(action: string) {
    const section = action.startsWith("outline-section:")
    if(!section && !action.startsWith("outline:")) return null
    const value = action.slice(action.indexOf(":") + 1)
    if(value && !/^\d+(,\d+)*$/.test(value)) return null
    const path = value ? value.split(",").map(Number) : []
    if(!section) return {item: this.treeItemAtPath(path)}
    return {section: this.tree ? treeIndex(this.tree).sections.get(this.pathKey(path)) : undefined}
  }

  private handleOutlineSelect = (event: CustomEvent<{label: string}>) => {
    event.stopPropagation()
    const target = this.outlineTarget(event.detail.label)
    this.collapseTree()
    if(target && "item" in target && target.item) this.select(target.item)
    if(target && "section" in target && target.section) this.selectSection(target.section)
  }

  private handleOutlineHover = (event: MouseEvent) => {
    const button = event.composedPath().find(node => node instanceof HTMLElement && node.hasAttribute("data-action")) as HTMLElement | undefined
    const target = this.outlineTarget(button?.getAttribute("data-action") ?? "")
    if(target && "item" in target && target.item) this.hover(target.item)
    if(target && "section" in target && target.section) this.dispatchSectionHover(target.section)
  }

  private renderTreeToggle(item: SelectionPathItem, fillDocument = false) {
    const isSameTree = this.treeOpen && this.pathsEqual(this.treeRootPath, item.path)
    const label = isSameTree ? `Close ${item.name} tree` : `Show ${item.name} tree`
    return html`
      <button
        class="separator-trigger"
        type="button"
        title=${label}
        aria-label=${label}
        aria-expanded=${isSameTree ? "true" : "false"}
        aria-controls="document-tree"
        aria-haspopup="menu"
        @click=${(event: Event) => this.toggleTree(item, event.currentTarget as HTMLButtonElement)}
      >
        <span class=${`separator-icon${fillDocument ? " separator-equals" : ""}`} aria-hidden="true">${fillDocument ? nothing : ribbonIcon("ChevronRight")}</span>
      </button>
    `
  }

  private renderItemIcon(item: SelectionPathItem) {
    return html`
      <span class=${`item-icon${item.iconUrl ? " image-icon" : ""}`}
        ?data-package-icon=${item.icon === "Packages" || Boolean(item.iconUrl)} aria-hidden="true">
        ${ribbonIcon(item.icon ?? item.name)}
        ${item.iconUrl ? html`<img
          src=${item.iconUrl}
          alt=""
          @error=${(event: Event) => {
            const image = event.currentTarget as HTMLImageElement
            image.parentElement?.classList.remove("image-icon")
            image.remove()
          }}
        />` : ""}
      </span>
    `
  }

  private isSectionSelected(section: SelectionPathSection) {
    return this.selectedSectionPath !== null && this.pathsEqual(this.selectedSectionPath, section.path)
  }

  private renderPositionIcons(item: SelectionPathItem | SelectionPathSection) {
    if(!this.showPositionIcons) return ""
    // Tree items share the current path's positioning context.
    const current = this.path.find(candidate => this.pathsEqual(candidate.path, item.path))
      ?? this.path.flatMap(candidate => candidate.sections ?? []).find(section => this.pathsEqual(section.path, item.path))
      ?? item
    if(current.fillViewport) return ""
    const {position, positionAnchor, float} = current
    const pinnedFloat = position === "sticky" && Boolean(float)
    const anchor = positionAnchor && !pinnedFloat
    const balloon = position === "relative" ? "BalloonFilled"
      : position === "absolute" || position === "fixed" || pinnedFloat ? "Balloon" : null
    if(!anchor && !balloon && !float) return ""
    const balloonLabel = pinnedFloat ? "Pinned float" : `${position} positioning`
    const balloonIcon = balloon ? html`<span class=${`position-icon position-balloon${pinnedFloat ? " position-balloon-pinned" : ""}`} role="img" aria-label=${balloonLabel} title=${balloonLabel}>${ribbonIcon(balloon)}</span>` : ""
    const floatLabel = float === "far-left" ? "Left float" : "Right float"
    const floatIcon = float ? html`<span class="position-icon position-float" role="img" aria-label=${floatLabel} title=${floatLabel}>${ribbonIcon(float === "far-left" ? "Float left" : "Float right")}</span>` : ""
    return html`<sup class="position-icons">
      ${anchor ? html`<span class="position-icon position-anchor" role="img" aria-label="Positioning anchor" title="Positioning anchor">${ribbonIcon("Anchor")}</span>` : ""}
      ${pinnedFloat ? [floatIcon, balloonIcon] : [balloonIcon, floatIcon]}
      ${(float === "far-left" && current.floatForcedRight) || (float === "far-right" && current.floatRightInFlow)
        ? html`<float-info placement="right" .side=${float === "far-right" ? "right" : "left"}></float-info>` : ""}
    </sup>`
  }

  private dispatchSectionHover(section: SelectionPathSection | null) {
    const path = section?.path ?? null
    if(path === null && this.hoveredSectionPath === null
      || path !== null && this.hoveredSectionPath !== null && this.pathsEqual(path, this.hoveredSectionPath)) return
    this.hoveredSectionPath = path ? [...path] : null
    this.dispatchEvent(new CustomEvent<SelectionPathSection | null>("breadcrumb-section-hover", {
      detail: section ? {...section, path: [...section.path]} : null,
      bubbles: true,
      composed: true,
    }))
  }

  private selectSection(section: SelectionPathSection, openToolbox = false) {
    this.dispatchEvent(new CustomEvent<BreadcrumbSelection<SelectionPathSection>>("breadcrumb-section-select", {
      detail: {...section, path: [...section.path], ...(openToolbox ? {openToolbox} : {})},
      bubbles: true,
      composed: true,
    }))
  }

  private renderSections(item: SelectionPathItem) {
    if(!item.sections?.length) return ""
    return html`
      <span class="item-sections" aria-label="Sections">
        ${item.sections.map(section => html`
          <button
            class=${`section-item${this.isSectionSelected(section) ? " section-selected" : ""}`}
            type="button"
            data-section-path=${section.path.join(",")}
            title=${`Select ${section.name} section`}
            aria-label=${`Select ${section.name} section`}
            aria-pressed=${this.isSectionSelected(section)}
            @mouseenter=${() => this.dispatchSectionHover(section)}
            @mouseleave=${() => this.dispatchSectionHover(null)}
            @click=${(event: MouseEvent) => this.selectSection(section, event.detail === 2)}
          >${section.name}${this.renderPositionIcons(section)}</button>
        `)}
      </span>
    `
  }

  private select(item: SelectionPathItem, openToolbox = false) {
    this.dispatchEvent(new CustomEvent<BreadcrumbSelection<SelectionPathItem>>("breadcrumb-item-select", {
      detail: {
        path: [...item.path],
        name: item.name,
        ...(item.icon ? {icon: item.icon} : {}),
        ...(item.iconUrl ? {iconUrl: item.iconUrl} : {}),
        ...(openToolbox ? {openToolbox} : {}),
      },
      bubbles: true,
      composed: true,
    }))
  }

  private isCollapsedBreadcrumbItem(entry: BreadcrumbEntry) {
    if(entry.kind !== "item") return false
    const itemIndex = this.breadcrumbEntries
      .filter(candidate => candidate.kind === "item")
      .findIndex(candidate => candidate.key === entry.key)
    return itemIndex >= 0 && itemIndex < this.breadcrumbCollapseCount
  }

  private renderBreadcrumbEntry(entry: BreadcrumbEntry) {
    const transitionClass = entry.state === "entering" ? "breadcrumb-fade-in" : ""
    const fillClass = entry.fillDocument ? " fill-document" : ""
    if(entry.kind === "separator") {
      return html`
        <li class=${`breadcrumb-entry separator tree-toggle-separator ${transitionClass}${fillClass}`}>
          ${this.itemHasChildren(entry.item)
            ? this.renderTreeToggle(entry.item, entry.fillDocument)
            : html`<span class=${`separator-icon${entry.fillDocument ? " separator-equals" : ""}`} aria-hidden="true">${entry.fillDocument ? nothing : ribbonIcon("ChevronRight")}</span>`}
        </li>
      `
    }

    const {item} = entry
    const itemClass = `item${this.isCollapsedBreadcrumbItem(entry) ? " icon-only" : ""}${this.isNodeSelected(item) ? " node-selected" : ""}${this.isCaptured(item.path) ? " capture-selected" : ""}`
    const label = `Select ${item.name}`
    const targetId = this.isSelected(item) ? item.targetId : undefined
    return html`
      <li class=${`breadcrumb-entry ${transitionClass}${fillClass}`}>
        <button
          class=${itemClass}
          type="button"
          data-path=${item.path.join(",")}
          title=${label}
          aria-label=${label}
          aria-pressed=${targetId ? String(item.targetSelected === true) : nothing}
          @mouseenter=${() => this.hover(item)}
          @mouseleave=${() => this.clearHover(item)}
          @click=${(event: MouseEvent) => {
            if(!targetId) {
              this.select(item, event.detail === 2)
              return
            }
            this.dispatchEvent(new CustomEvent("breadcrumb-item-toggle", {
              detail: {path: [...item.path], targetId}, bubbles: true, composed: true,
            }))
          }}
        >
          ${this.renderItemIcon(item)}
          <span class="item-label">${item.name}</span>
          ${item.imageMap ? html`<span class="image-hotspot-indicator" role="img" aria-label="Interactive image hotspots" title="Interactive image hotspots">${ribbonIcon("Image hotspot")}</span>` : ""}
          ${this.renderPositionIcons(item)}
        </button>
        ${this.renderSections(item)}
      </li>
    `
  }

  private renderBreadcrumbList() {
    return html`
      <ol class="breadcrumb-list">
        ${repeat(this.breadcrumbEntries, entry => entry.key, entry => this.renderBreadcrumbEntry(entry))}
      </ol>
    `
  }

  render() {
    const root = this.treeItemAtPath(this.treeRootPath) ?? this.tree
    return html`
      <nav aria-label="Current selection path" @pointerdown=${this.handlePointerDown}>
        ${this.renderBreadcrumbList()}
      </nav>
      ${this.treeOpen && root ? html`
        <ribbon-menu id="document-tree" variant="button" popover="auto" label="Document outline"
          .groups=${[{label: root.name, buttons: this.outlineButtons(root.children)}]}
          @pointerdown=${this.handlePointerDown}
          @ribbon-button-click=${this.handleOutlineSelect}
          @mouseover=${this.handleOutlineHover}
          @mouseout=${() => { this.clearHover(); this.dispatchSectionHover(null) }}
          @toggle=${(event: ToggleEvent) => { if(event.newState === "closed") this.collapseTree() }}
          @keydown=${(event: KeyboardEvent) => {
            if(event.key !== "Escape" || event.defaultPrevented) return
            event.preventDefault()
            const anchor = this.menuAnchor
            this.collapseTree()
            anchor?.focus()
          }}
        ></ribbon-menu>
      ` : ""}
    `
  }

  disconnectedCallback() {
    this.collapseTree()
    this.anchorPositioner.destroy()
    this.breadcrumbResizeObserver?.disconnect()
    this.breadcrumbResizeObserver = undefined
    this.responsiveLayoutQueued = false
    window.removeEventListener("resize", this.handleWindowResize)
    super.disconnectedCallback()
  }
}

if(!customElements.get("dom-editor-breadcrumb")) {
  customElements.define("dom-editor-breadcrumb", DomEditorBreadcrumb)
}

declare global {
  interface HTMLElementTagNameMap {
    "dom-editor-breadcrumb": DomEditorBreadcrumb
  }
}
