import { LitElement, css, html } from "lit"
import { property, state } from "lit/decorators.js"
import {fixedClientX, uiMotionDisabled} from "../utility"
import { ribbonIcon } from "../ribbon-icons"
import {packageCategoryLabel, packageNameLabel} from "../packages"
import {groupInsertablesByCategory, insertSubmenuClickGrace, insertSubmenuHoverDelay, insertionMenuItems, sectionInsertionTags, type InsertionMenuItem} from "../insertion"
export {
  deliberatelyUnsupportedInsertionTags, elementDragType, emptyElementHTML, headingInsertionTags,
  insertionMenuItems, nodeDragType, ribbonElementInsertionAction, ribbonElementTag,
  ribbonInsertionAction, ribbonInsertionDragType, sectionInsertionTags, startElementDrag,
  startRibbonInsertionDrag, type InsertionMenuItem,
} from "../insertion"

/** A searchable element picker for the editor's element command. The editor
 * supplies the query from the text typed after the command trigger. */
export class InsertionMenu extends LitElement {
  static styles = css`
    :host {
      position: fixed;
      z-index: 2147483647;
      display: block;
      width: min(13rem, calc(100vw - 1rem));
      color: #1f2937;
      font: 14px/1.35 system-ui, sans-serif;
      pointer-events: auto;
    }

    :host([inline]) {
      position: static;
      width: 100%;
    }

    [hidden] { display: none; }

    .menu {
      overflow: hidden;
      border: 1px solid #d1d5db;
      border-radius: 0.5rem;
      background: white;
      box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 18%);
    }

    .close {
      position: absolute;
      top: 0.25rem;
      right: 0.25rem;
      width: 2.25rem;
      height: 2.25rem;
      border: 0;
      color: #6b7280;
      font: 1.25rem/1 system-ui, sans-serif;
      background: transparent;
      cursor: pointer;
    }

    .menu { position: relative; }
    .close:hover { background: transparent; color: #111827; }
    .sections { max-height: min(24rem, calc(100vh - 6rem)); overflow: auto; scrollbar-width: thin; padding: 0.35rem; }
    :host([inline]) .sections { max-height: min(14rem, calc(100vh - 2rem)); }
    section + section { margin-top: 0.25rem; }
    h2 { margin: 0.45rem 0.4rem 0.2rem; color: #6b7280; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }

    .item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      width: 100%;
      border: 0;
      border-radius: 0.25rem;
      padding: 0.4rem 0.5rem;
      color: inherit;
      text-align: left;
      font: inherit;
      background: transparent;
      cursor: pointer;
    }

    .item:hover { background: #eef4fb; }
    .item[data-active] { color: #0c4a6e; background: #e0f2fe; }
    .category-back { width: calc(100% - 2.25rem); margin-bottom: 0.25rem; font-weight: 600; }
    .category-back .item-icon { transform: rotate(180deg); }
    .category-next { margin-inline-start: auto; }

    .item-icon {
      display: block;
      flex: 0 0 1rem;
      width: 1rem;
      height: 1rem;
      color: #526b86;
    }

    .item-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .item-icon img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .item-icon[data-package-icon] { filter: grayscale(1); }

    .item-text { min-width: 0; }
    .item-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .item-package { display: block; color: #6b7280; font-size: 0.65rem; }
  `

  @property({type: Boolean, reflect: true}) open = false
  @property({type: String}) query = ""
  @property({attribute: false}) items: InsertionMenuItem[] | null = null
  @property({type: Boolean, reflect: true}) inline = false
  @state() private activeIndex = -1
  @state() private activeCategory: string | null = null
  private categoryHoverTimer: ReturnType<typeof setTimeout> | undefined
  private categoryHover: {openedAt: number, triggerBounds: DOMRect} | null = null

  get filteredItems() {
    const query = this.query.trim().toLowerCase()
    const locale = this.ownerDocument.documentElement.lang || this.ownerDocument.defaultView?.navigator.language || "en"
    const items: InsertionMenuItem[] = this.items ?? [
      ...insertionMenuItems.filter(item => item.kind !== "html" && item.tag !== "pre"
        && !sectionInsertionTags.some(tag => tag === item.tag)),
      ...(globalThis.DOMEDITOR_PACKAGE_ITEMS ?? []).map(({category, ...item}) =>
        ({...item, category: packageCategoryLabel(category, locale)})),
    ]
    return items.filter(item => (!("insertable" in item) || item.insertable !== false) && (!query || [item.name, item.id, item.tag, item.category, item.packageName,
      item.packageName && packageNameLabel(item.packageName), item.kind]
      .filter(Boolean).join(" ").toLowerCase().includes(query)))
  }

  private get sections() {
    const items = this.filteredItems
    if(this.activeCategory) {
      return [{
        label: this.activeCategory,
        entries: items.filter(item => item.section === "Packages" && item.category === this.activeCategory).map(item => ({item})),
      }]
    }
    return [
      {label: "Elements", entries: items.filter(item => item.section !== "Packages").map(item => ({item}))},
      {label: "Packages", entries: groupInsertablesByCategory(items.filter(item => item.section === "Packages"), item => item.category)},
    ]
  }

  private get activeEntry() {
    return this.sections.flatMap(section => section.entries)[this.activeIndex]
  }

  get activeItem() {
    const entry = this.activeEntry
    return entry && "item" in entry ? entry.item : undefined
  }

  showAt(x: number, y: number) {
    this.resetCategoryHover()
    this.setPosition(x, y)
    this.query = ""
    this.activeCategory = null
    this.activeIndex = -1
    this.resetScrollPosition()
    this.open = true
  }

  setPosition(x: number, y: number) {
    this.style.left = `${fixedClientX(Math.max(8, x), this.ownerDocument)}px`
    this.style.top = `${Math.max(8, y)}px`
  }

  moveActive(direction: 1 | -1) {
    const count = this.sections.reduce((total, section) => total + section.entries.length, 0)
    if(!count) return
    if(this.activeIndex < 0) {
      this.activeIndex = direction === 1? 0: count - 1
      return
    }
    this.activeIndex = (this.activeIndex + direction + count) % count
  }

  selectActive() {
    const entry = this.activeEntry
    if(!entry) return false
    if("category" in entry) this.openCategory(entry.category)
    else this.choose(entry.item)
    return true
  }

  openActiveCategory() {
    const entry = this.activeEntry
    if(!entry || !("category" in entry)) return false
    this.openCategory(entry.category)
    return true
  }

  private openCategory(category: string) {
    this.resetCategoryHover()
    this.activeCategory = category
    this.activeIndex = 0
  }

  closeCategory() {
    const category = this.activeCategory
    if(!category) return false
    this.resetCategoryHover()
    this.activeCategory = null
    this.activeIndex = this.sections.flatMap(section => section.entries)
      .findIndex(entry => "category" in entry && entry.category === category)
    return true
  }

  protected willUpdate(changed: Map<string, unknown>) {
    if(changed.has("query") || changed.has("items") || !this.open) {
      this.resetCategoryHover()
      this.activeCategory = null
      this.activeIndex = -1
    }
  }

  protected updated(changed: Map<string, unknown>) {
    if(!this.open) return
    if(changed.has("open") || changed.has("query") || (changed.has("activeCategory") && this.activeCategory)) this.resetScrollPosition()
    else if(changed.has("activeIndex") || changed.has("activeCategory")) {
      this.shadowRoot?.querySelector<HTMLElement>(".item[data-active]")
        ?.scrollIntoView({behavior: uiMotionDisabled(this) ? "instant" : "smooth", block: "nearest", inline: "nearest"})
    }
  }

  private resetScrollPosition() {
    const sections = this.shadowRoot?.querySelector<HTMLElement>(".sections")
    sections?.scrollTo({top: 0, behavior: "instant"})
  }

  private choose(item: InsertionMenuItem) {
    this.dispatchEvent(new CustomEvent<InsertionMenuItem>("insertion-menu-select", {
      detail: item,
      bubbles: true,
      composed: true,
    }))
  }

  private cancelCategoryHover = () => clearTimeout(this.categoryHoverTimer)

  private resetCategoryHover() {
    this.cancelCategoryHover()
    this.categoryHover = null
  }

  private scheduleCategoryHover(event: PointerEvent, category: string) {
    if(event.pointerType !== "mouse" || event.buttons) return
    const trigger = event.currentTarget as HTMLElement
    this.cancelCategoryHover()
    this.categoryHoverTimer = setTimeout(() => {
      if(!this.open || this.activeCategory || !trigger.isConnected) return
      const triggerBounds = trigger.getBoundingClientRect()
      this.openCategory(category)
      this.categoryHover = {openedAt: Date.now(), triggerBounds}
    }, insertSubmenuHoverDelay)
  }

  private activateFromClick(event: MouseEvent, activate: () => void) {
    // Hover replaces the list in place. Guard clicks that can still land where the trigger was.
    const hover = this.categoryHover
    if(hover && (event.detail > 0 || event.type === "pointerdown")
      && Date.now() - hover.openedAt < insertSubmenuClickGrace) {
      const {left, right, top, bottom} = hover.triggerBounds
      if(event.clientX >= left && event.clientX <= right && event.clientY >= top && event.clientY <= bottom) return
    }
    activate()
  }

  private activateFromPointer(event: PointerEvent, activate: () => void) {
    if(event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    this.activateFromClick(event, activate)
  }

  disconnectedCallback() {
    this.resetCategoryHover()
    super.disconnectedCallback()
  }

  private close() {
    this.dispatchEvent(new Event("insertion-menu-close", {bubbles: true, composed: true}))
  }

  private renderItemIcon(item: InsertionMenuItem) {
    return html`<span class="item-icon" ?data-package-icon=${item.section === "Packages" || Boolean(item.iconUrl)} aria-hidden="true">
      ${item.iconUrl ? html`<img src=${item.iconUrl} alt="" />` : ribbonIcon(item.section === "Packages" ? "Packages" : item.icon ?? item.name)}
    </span>`
  }

  render() {
    const sections = this.sections
    const active = sections.flatMap(section => section.entries)[this.activeIndex]
    return html`
      <div class="menu" ?hidden=${!this.open}>
        <button
          class="close"
          type="button"
          aria-label="Close element menu"
          title="Close"
          @pointerdown=${(event: PointerEvent) => this.activateFromPointer(event, () => this.close())}
          @click=${this.close}
        >×</button>
        <div class="sections">
          ${sections.map(({label, entries}) => html`
            <section aria-label=${label}>
              ${this.activeCategory ? html`
                <button class="item category-back" type="button" aria-label="Back to insert menu"
                  @pointerdown=${(event: PointerEvent) => this.activateFromPointer(event, () => this.closeCategory())}
                  @click=${(event: MouseEvent) => this.activateFromClick(event, () => this.closeCategory())}>
                  <span class="item-icon" aria-hidden="true">${ribbonIcon("ChevronRight")}</span>
                  <span class="item-text item-name">${label}</span>
                </button>
              ` : html`<h2>${label}</h2>`}
              ${entries.map(entry => {
                if("category" in entry) return html`
                  <button class="item" type="button"
                    ?data-active=${active === entry}
                    @pointerenter=${(event: PointerEvent) => this.scheduleCategoryHover(event, entry.category)}
                    @pointerleave=${this.cancelCategoryHover}
                    @pointerdown=${(event: PointerEvent) => this.activateFromPointer(event, () => this.openCategory(entry.category))}
                    @click=${() => this.openCategory(entry.category)}>
                    ${this.renderItemIcon(entry.items[0])}
                    <span class="item-text item-name">${entry.category}</span>
                    <span class="item-icon category-next" aria-hidden="true">${ribbonIcon("ChevronRight")}</span>
                  </button>
                `
                const {item} = entry
                return html`
                  <button
                    class="item"
                    type="button"
                    ?data-active=${active === entry}
                    @pointerdown=${(event: PointerEvent) => this.activateFromPointer(event, () => this.choose(item))}
                    @click=${(event: MouseEvent) => this.activateFromClick(event, () => this.choose(item))}
                  >
                    ${this.renderItemIcon(item)}
                    <span class="item-text">
                      <span class="item-name">${item.name}</span>
                      ${item.packageName ? html`<span class="item-package">${packageNameLabel(item.packageName)}</span>` : ""}
                    </span>
                  </button>
                `
              })}
            </section>
          `)}
        </div>
      </div>
    `
  }
}

if(!customElements.get("domeditor-insertion-menu")) {
  customElements.define("domeditor-insertion-menu", InsertionMenu)
}

declare global {
  interface HTMLElementTagNameMap {
    "domeditor-insertion-menu": InsertionMenu
  }
}
