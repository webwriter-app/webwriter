import { LitElement, css, html } from "lit"
import { repeat } from "lit/directives/repeat.js"
import { ribbonIcon } from "../ribbon-icons"
import type { SelectionGap, SelectionPathItem } from "../editor-bridge"

export type DocumentTreeItem = SelectionPathItem & {
  children: DocumentTreeItem[]
}

type BreadcrumbEntry = {
  key: string
  kind: "item" | "separator"
  item: SelectionPathItem
  state: "visible" | "entering"
}

/** A compact, clickable path for the element containing the current selection. */
export class DomEditorBreadcrumb extends LitElement {
  static properties = {
    path: {attribute: false},
    nodeSelected: {type: Boolean, attribute: "node-selected", reflect: true},
    capture: {type: Boolean, reflect: true},
    gap: {attribute: false},
    tree: {attribute: false},
    breadcrumbEntries: {attribute: false, state: true},
    breadcrumbCollapseCount: {attribute: false, state: true},
    treeOpen: {attribute: "tree-open", type: Boolean, reflect: true},
    treeRootPath: {attribute: false, state: true},
    expandedPaths: {attribute: false, state: true},
    treeHeight: {attribute: false, state: true},
    treeAnimating: {attribute: "tree-animating", type: Boolean, reflect: true},
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

    :host([tree-open]),
    :host([tree-animating]) {
      flex: 0 0 auto;
      height: auto;
      min-height: 30px;
      max-height: none;
      overflow: visible;
    }

    nav {
      box-sizing: border-box;
      width: 100%;
      height: auto;
      overflow-x: hidden;
      overflow-y: visible;
    }

    nav.tree-nav {
      height: auto;
      max-height: none;
      overflow: visible;
    }

    .tree-panel {
      max-height: 0;
      overflow: hidden;
      pointer-events: none;
      transition: max-height 180ms ease;
    }

    .tree-panel[aria-hidden="false"] {
      padding-bottom: 4px;
      pointer-events: auto;
    }

    ol {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      width: 100%;
      min-width: 0;
      height: 30px;
      margin: 0;
      padding: 0 0.35rem;
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
      animation: breadcrumb-fade-in 120ms ease both;
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

    .item.node-selected .item-label,
    .tree-item.node-selected .item-label {
      text-decoration: underline;
      text-decoration-color: var(--sl-color-primary-400, #38bdf8);
      text-decoration-style: dotted;
      text-decoration-thickness: 2px;
      text-underline-offset: 3px;
    }

    .item.capture-selected .item-label,
    .tree-item.capture-selected .item-label {
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

    .item-icon img {
      position: absolute;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .tree-list,
    .tree-children {
      box-sizing: border-box;
      width: 100%;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .tree-node {
      position: relative;
      margin: 0;
      padding: 0;
    }

    .tree-gap-indicator {
      position: absolute;
      right: 0.35rem;
      left: calc(var(--tree-depth) * 1rem + 24px);
      z-index: 1;
      height: 2px;
      border-radius: 999px;
      background: #bdd3e9;
      pointer-events: none;
    }

    .tree-gap-indicator::before {
      position: absolute;
      top: 50%;
      left: -3px;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: inherit;
      content: "";
      transform: translateY(-50%);
    }

    .tree-gap-indicator-before {
      top: 0;
      transform: translateY(-50%);
    }

    .tree-gap-indicator-after {
      bottom: 0;
      transform: translateY(50%);
    }

    .tree-gap-indicator-start {
      top: 3px;
      transform: none;
    }

    .tree-row {
      display: flex;
      align-items: center;
      min-height: 30px;
      padding-left: calc(var(--tree-depth) * 1rem);
    }

    .tree-expander,
    .tree-expander-spacer {
      display: inline-flex;
      flex: 0 0 24px;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 28px;
    }

    .tree-expander {
      margin: 0;
      padding: 0;
      border: 0;
      border-radius: 0.2rem;
      color: #8a96a5;
      background: transparent;
      cursor: pointer;
    }

    .tree-expander:hover {
      color: #243447;
      background: #e8eef5;
    }

    .tree-expander:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -1px;
    }

    .tree-expander-icon {
      display: inline-flex;
      width: 13px;
      height: 13px;
      transition: transform 120ms ease;
    }

    .tree-expander[aria-expanded="true"] .tree-expander-icon {
      transform: rotate(90deg);
    }

    .tree-expander-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .tree-item {
      display: inline-flex;
      flex: 1 1 auto;
      align-items: center;
      gap: 0.2rem;
      min-width: 0;
      height: 28px;
      margin: 0;
      padding: 0 0.25rem;
      border: 0;
      border-radius: 0.2rem;
      color: inherit;
      font: 11px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      text-align: left;
      background: transparent;
      cursor: pointer;
    }

    .tree-item:hover {
      color: #243447;
      background: #e8eef5;
    }

    .tree-item[aria-current="true"] {
      color: #243447;
      background: #dbe7f2;
    }

    .tree-item:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -1px;
    }

    .tree-item > span:last-child {
      overflow: clip visible;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `

  path: SelectionPathItem[] = []
  nodeSelected = false
  capture = false
  gap: SelectionGap | null = null
  tree: DocumentTreeItem | null = null
  private breadcrumbEntries: BreadcrumbEntry[] = []
  treeOpen = false
  private treeRootPath: number[] = []
  private expandedPaths = new Set<string>()
  private treeHeight = 0
  private treeAnimating = false
  private treeCollapseTimer: ReturnType<typeof setTimeout> | null = null
  private hoveredPath: number[] | null = null
  private breadcrumbCollapseCount = 0
  private breadcrumbResizeObserver: ResizeObserver | undefined
  private responsiveLayoutQueued = false

  private readonly handleWindowResize = () => this.scheduleResponsiveLayout()

  private get displayPath() {
    return this.path.length
      ? this.path
      : [{path: [], name: "Document", icon: "Document"}]
  }

  private desiredBreadcrumbEntries() {
    const path = this.visibleBreadcrumbPath(!this.treeOpen)
    const entries: BreadcrumbEntry[] = []
    for(const item of path) {
      entries.push({
        key: `item:${this.pathKey(item.path)}`,
        kind: "item",
        item,
        state: "visible",
      })
      if(this.itemHasChildren(item)) {
        entries.push({
          key: `separator:${this.pathKey(item.path)}`,
          kind: "separator",
          item,
          state: "visible",
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
        && entry.item.name === other.item.name
        && entry.item.icon === other.item.icon
        && entry.item.iconUrl === other.item.iconUrl
        && this.pathsEqual(entry.item.path, other.item.path)
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
    const find = (item: DocumentTreeItem): DocumentTreeItem | null => {
      if(this.pathsEqual(item.path, path)) return item
      for(const child of item.children) {
        const match = find(child)
        if(match) return match
      }
      return null
    }
    return this.tree? find(this.tree): null
  }

  private itemHasChildren(item: SelectionPathItem) {
    const treeItem = this.treeItemAtPath(item.path)
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

  private setTreeRoot(path: number[]) {
    this.treeRootPath = [...path]
    this.expandedPaths = new Set([
      this.pathKey(path),
      ...this.displayPath.map(pathItem => this.pathKey(pathItem.path)),
    ])
  }

  private pathIsPrefix(prefix: number[], path: number[]) {
    return prefix.length <= path.length
      && prefix.every((index, position) => index === path[position])
  }

  private commonPath(first: number[], second: number[]) {
    const length = Math.min(first.length, second.length)
    let shared = 0
    while(shared < length && first[shared] === second[shared]) shared++
    return first.slice(0, shared)
  }

  protected willUpdate(changedProperties: Map<PropertyKey, unknown>) {
    if(this.treeOpen && changedProperties.has("path")) {
      const selected = this.selectedPath()
      if(selected !== null) {
        const expandedPaths = new Set(this.expandedPaths)
        for(const pathItem of this.displayPath) expandedPaths.add(this.pathKey(pathItem.path))

        if(this.pathIsPrefix(this.treeRootPath, selected)) {
          this.expandedPaths = expandedPaths
        }
        else {
          const higherRoot = this.commonPath(this.treeRootPath, selected)
          if(this.treeItemAtPath(higherRoot)) {
            this.treeRootPath = [...higherRoot]
            this.expandedPaths = expandedPaths
          }
        }
      }
    }

    if(changedProperties.has("path")
      || changedProperties.has("tree")
      || changedProperties.has("treeOpen")) {
      this.syncBreadcrumbEntries()
    }
  }

  private scheduleTreeCollapse() {
    if(this.treeCollapseTimer !== null) clearTimeout(this.treeCollapseTimer)
    this.treeCollapseTimer = setTimeout(() => {
      this.treeCollapseTimer = null
      if(!this.treeOpen) this.treeAnimating = false
    }, 180)
  }

  protected updated(changedProperties: Map<PropertyKey, unknown>) {
    if(this.hoveredPath && !this.hasRenderedItem(this.hoveredPath)) {
      this.clearHover()
    }

    if(changedProperties.has("path")
      || changedProperties.has("tree")
      || changedProperties.has("treeOpen")
      || changedProperties.has("breadcrumbEntries")) {
      this.scheduleResponsiveLayout()
    }

    if(!changedProperties.has("treeOpen")
      && !changedProperties.has("tree")
      && !changedProperties.has("expandedPaths")) return

    const panel = this.renderRoot.querySelector<HTMLElement>(".tree-panel")
    if(!panel) return
    const height = panel.scrollHeight
    if(height !== this.treeHeight) this.treeHeight = height
  }

  connectedCallback() {
    super.connectedCallback()
    window.addEventListener("resize", this.handleWindowResize)
  }

  protected firstUpdated() {
    const nav = this.renderRoot.querySelector<HTMLElement>("nav")
    if(nav && typeof ResizeObserver !== "undefined") {
      this.breadcrumbResizeObserver = new ResizeObserver(() => this.scheduleResponsiveLayout())
      this.breadcrumbResizeObserver.observe(nav)
    }
    this.scheduleResponsiveLayout()
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
    for(const item of items) {
      if(requiredWidth <= availableWidth + 0.5) break

      const button = item.querySelector<HTMLElement>(".item")
      if(!button) continue
      const expandedWidth = item.getBoundingClientRect().width
      button.classList.add(collapsedClass)
      const collapsedWidth = item.getBoundingClientRect().width
      requiredWidth -= expandedWidth - collapsedWidth
      collapseCount++
    }

    items.forEach((item, index) => {
      item.querySelector(".item")?.classList.toggle(collapsedClass, index < collapseCount)
    })

    if(this.breadcrumbCollapseCount !== collapseCount) {
      this.breadcrumbCollapseCount = collapseCount
    }
  }

  private readonly handlePointerDown = (event: PointerEvent) => {
    if(event.button !== 0) return

    // Keep the editor iframe as the active element while the breadcrumb is
    // used with a pointer. The click event still performs the breadcrumb action.
    event.preventDefault()
  }

  private hasRenderedItem(path: number[]) {
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
    if(!this.treeOpen) return
    const path = [...this.treeRootPath]
    this.treeOpen = false
    this.treeRootPath = []
    this.treeAnimating = true
    this.scheduleTreeCollapse()
    this.dispatchEvent(new CustomEvent<{open: boolean, path: number[]}>("breadcrumb-tree-toggle", {
      detail: {open: false, path},
      bubbles: true,
      composed: true,
    }))
  }

  private toggleTree(item: SelectionPathItem) {
    const isSameTree = this.treeOpen && this.pathsEqual(this.treeRootPath, item.path)
    this.treeOpen = !isSameTree
    if(this.treeOpen) {
      if(this.treeCollapseTimer !== null) clearTimeout(this.treeCollapseTimer)
      this.treeCollapseTimer = null
      this.treeAnimating = false
      this.setTreeRoot(item.path)
    }
    else {
      this.clearHover()
      this.treeRootPath = []
      this.treeAnimating = true
      this.scheduleTreeCollapse()
    }
    this.dispatchEvent(new CustomEvent<{open: boolean, path: number[]}>("breadcrumb-tree-toggle", {
      detail: {open: this.treeOpen, path: [...item.path]},
      bubbles: true,
      composed: true,
    }))
  }

  private toggleTreeItem(item: DocumentTreeItem, event: Event) {
    event.stopPropagation()
    const key = this.pathKey(item.path)
    const expandedPaths = new Set(this.expandedPaths)
    if(expandedPaths.has(key)) expandedPaths.delete(key)
    else expandedPaths.add(key)
    this.expandedPaths = expandedPaths
  }

  private renderTreeToggle(item: SelectionPathItem) {
    const isSameTree = this.treeOpen && this.pathsEqual(this.treeRootPath, item.path)
    const label = isSameTree ? "Show breadcrumb path" : `Show ${item.name} tree`
    return html`
      <button
        class="separator-trigger"
        type="button"
        title=${label}
        aria-label=${label}
        aria-expanded=${this.treeOpen ? "true" : "false"}
        aria-controls="document-tree"
        @click=${() => this.toggleTree(item)}
      >
        <span class="separator-icon" aria-hidden="true">${ribbonIcon("ChevronRight")}</span>
      </button>
    `
  }

  private renderItemIcon(item: SelectionPathItem) {
    return html`
      <span class=${`item-icon${item.iconUrl ? " image-icon" : ""}`} aria-hidden="true">
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

  private gapMarkerFor(items: DocumentTreeItem[], parentPath: number[]) {
    const gap = this.gap
    if(!gap || !items.length || !this.pathsEqual(gap.parentPath, parentPath)) return null

    const nextIndex = items.findIndex(item => item.path[item.path.length - 1] >= gap.offset)
    return nextIndex >= 0
      ? {index: nextIndex, position: "before" as const}
      : {index: items.length - 1, position: "after" as const}
  }

  private renderGapIndicator(position: "before" | "after", depth: number, atTreeStart = false) {
    return html`
      <span
        class=${`tree-gap-indicator tree-gap-indicator-${position}${atTreeStart ? " tree-gap-indicator-start" : ""}`}
        style=${`--tree-depth: ${depth}`}
        aria-hidden="true"
      ></span>
    `
  }

  private renderTreeChildren(items: DocumentTreeItem[], parentPath: number[], depth: number): unknown {
    const marker = this.gapMarkerFor(items, parentPath)
    return items.map((child, index) => this.renderTreeItem(
      child,
      depth,
      marker?.index === index ? marker.position : null,
      marker?.index === index && marker.position === "before" && depth === 0,
    ))
  }

  private renderTreeItem(item: DocumentTreeItem, depth: number, gapPosition: "before" | "after" | null = null, gapAtTreeStart = false): unknown {
    const expandable = item.children.length > 0
    const expanded = this.expandedPaths.has(this.pathKey(item.path))
    return html`
      <li
        class="tree-node"
        role="treeitem"
        aria-level=${depth + 1}
        aria-expanded=${expandable ? (expanded ? "true" : "false") : "false"}
      >
        <div class="tree-row" style=${`--tree-depth: ${depth}`}>
          ${expandable ? html`
            <button
              class="tree-expander"
              type="button"
              aria-label=${`${expanded ? "Collapse" : "Expand"} ${item.name}`}
              aria-expanded=${expanded ? "true" : "false"}
              @click=${(event: Event) => this.toggleTreeItem(item, event)}
            >
              <span class="tree-expander-icon" aria-hidden="true">${ribbonIcon("ChevronRight")}</span>
            </button>
          ` : html`<span class="tree-expander-spacer" aria-hidden="true"></span>`}
          <button
            class=${`tree-item${this.isNodeSelected(item) ? " node-selected" : ""}${this.isCaptured(item.path) ? " capture-selected" : ""}`}
            type="button"
            data-path=${item.path.join(",")}
            title=${`Select ${item.name}`}
            aria-label=${`Select ${item.name}`}
            aria-current=${this.isSelected(item) ? "true" : "false"}
            @mouseenter=${() => this.hover(item)}
            @mouseleave=${() => this.clearHover(item)}
            @click=${() => this.select(item)}
          >
            ${this.renderItemIcon(item)}
            <span class="item-label">${item.name}</span>
          </button>
        </div>
        ${gapPosition ? this.renderGapIndicator(gapPosition, depth, gapAtTreeStart) : ""}
        ${expandable && expanded ? html`
          <ul class="tree-children" role="group">
            ${this.renderTreeChildren(item.children, item.path, depth + 1)}
          </ul>
        ` : ""}
      </li>
    `
  }

  private select(item: SelectionPathItem) {
    this.dispatchEvent(new CustomEvent<SelectionPathItem>("breadcrumb-item-select", {
      detail: {
        path: [...item.path],
        name: item.name,
        ...(item.icon ? {icon: item.icon} : {}),
        ...(item.iconUrl ? {iconUrl: item.iconUrl} : {}),
      },
      bubbles: true,
      composed: true,
    }))
  }

  private visibleBreadcrumbPath(showPath: boolean) {
    if(showPath) return this.displayPath

    const rootIndex = this.displayPath.findIndex(item => this.pathsEqual(item.path, this.treeRootPath))
    return this.displayPath.slice(0, rootIndex >= 0 ? rootIndex + 1 : 1)
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
    if(entry.kind === "separator") {
      return html`
        <li class=${`breadcrumb-entry separator tree-toggle-separator ${transitionClass}`}>
          ${this.renderTreeToggle(entry.item)}
        </li>
      `
    }

    return html`
      <li class=${`breadcrumb-entry ${transitionClass}`}>
        <button
          class=${`item${this.isCollapsedBreadcrumbItem(entry) ? " icon-only" : ""}${this.isNodeSelected(entry.item) ? " node-selected" : ""}${this.isCaptured(entry.item.path) ? " capture-selected" : ""}`}
          type="button"
          data-path=${entry.item.path.join(",")}
          title=${`Select ${entry.item.name}`}
          aria-label=${`Select ${entry.item.name}`}
          @mouseenter=${() => this.hover(entry.item)}
          @mouseleave=${() => this.clearHover(entry.item)}
          @click=${() => this.select(entry.item)}
        >
          ${this.renderItemIcon(entry.item)}
          <span class="item-label">${entry.item.name}</span>
        </button>
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
    return html`
      <nav
        class=${this.treeOpen || this.treeAnimating ? "tree-nav" : "breadcrumb-nav"}
        aria-label=${this.treeOpen ? "Document tree" : "Current selection path"}
        @pointerdown=${this.handlePointerDown}
      >
        ${this.renderBreadcrumbList()}
        ${this.tree ? html`
          <div
            class="tree-panel"
            style=${`max-height: ${this.treeOpen ? `${this.treeHeight}px` : "0px"}`}
            aria-hidden=${this.treeOpen ? "false" : "true"}
            ?inert=${!this.treeOpen}
          >
            <ul id="document-tree" class="tree-list" role="tree">
              ${(() => {
                const root = this.treeItemAtPath(this.treeRootPath)
                const treeRoot = root ?? this.tree
                return this.renderTreeChildren(treeRoot.children, treeRoot.path, 0)
              })()}
            </ul>
          </div>
        ` : ""}
      </nav>
    `
  }

  disconnectedCallback() {
    this.clearHover()
    if(this.treeCollapseTimer !== null) clearTimeout(this.treeCollapseTimer)
    this.treeCollapseTimer = null
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
