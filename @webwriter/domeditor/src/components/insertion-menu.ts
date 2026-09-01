import { LitElement, css, html } from "lit"
import { property, state } from "lit/decorators.js"
import {getElementPresentation} from "../element-names"
import { ribbonIcon } from "../ribbon-icons"
import type {PackageInsertionItem} from "../packages"
import {insertableFormElementTypes} from "../form"
import {sectionNames} from "../sections"

export type InsertionMenuItem = {
  tag?: string
  name: string
  section: "Text" | "Lists" | "Media" | "Forms" | "Packages"
  packageName?: string
  kind?: "widget" | "snippet" | "html"
  description?: string
  icon?: string
  iconUrl?: string
  htmlUrl?: string
}

type BuiltinInsertionMenuItem = InsertionMenuItem & {
  tag: string
  section: "Text" | "Lists" | "Media" | "Forms"
}

const insertionMenuItem = (
  section: BuiltinInsertionMenuItem["section"],
  tag: string,
  name?: string,
): BuiltinInsertionMenuItem => {
  const presentation = getElementPresentation(tag)
  return {section, tag, name: name ?? presentation.name, icon: presentation.icon}
}

export const headingInsertionTags = ["h2", "h3", "h4", "h5", "h6", "hr"] as const
export const detailsInsertionTags = ["dialog"] as const
export const formInsertionTags = insertableFormElementTypes
export const sectionInsertionTags = sectionNames.filter(tag => tag !== "section")
export const hiddenRibbonInsertionTags = ["canvas", "template", "slot"] as const

export const insertionMenuItems: InsertionMenuItem[] = [
  insertionMenuItem("Text", "p"),
  insertionMenuItem("Text", "pre"),
  insertionMenuItem("Text", "h1"),
  ...headingInsertionTags.map(tag => insertionMenuItem("Text", tag)),
  insertionMenuItem("Lists", "ul"),
  insertionMenuItem("Lists", "ol"),
  insertionMenuItem("Lists", "dl"),
  insertionMenuItem("Lists", "details"),
  ...detailsInsertionTags.map(tag => insertionMenuItem("Lists", tag)),
  insertionMenuItem("Media", "table"),
  insertionMenuItem("Media", "picture"),
  insertionMenuItem("Media", "svg"),
  insertionMenuItem("Media", "audio"),
  insertionMenuItem("Media", "iframe"),
  insertionMenuItem("Media", "video"),
  insertionMenuItem("Media", "math"),
  ...formInsertionTags.map(tag => insertionMenuItem("Forms", tag)),
  insertionMenuItem("Media", "section"),
  ...sectionInsertionTags.map(tag => insertionMenuItem("Media", tag, tag === "div" ? "Division" : undefined)),
  ...hiddenRibbonInsertionTags
    .map(tag => insertionMenuItem("Media", tag, tag === "canvas" ? "Canvas" : undefined)),
  {section: "Media", name: "HTML", icon: "Code", kind: "html"},
]

/** Returns valid empty-element markup using the browser's HTML serializer. */
export const emptyElementHTML = (tag: string) => document.createElement(tag).outerHTML

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
      filter: grayscale(1);
    }

    .item-text { min-width: 0; }
    .item-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .item-package { display: block; color: #6b7280; font-size: 0.65rem; }
  `

  @property({type: Boolean, reflect: true}) open = false
  @property({type: String}) query = ""
  @state() private activeIndex = -1

  get filteredItems() {
    const query = this.query.trim().toLowerCase()
    const items: InsertionMenuItem[] = [
      ...insertionMenuItems.filter(item => item.kind !== "html"),
      ...(globalThis.DOMEDITOR_PACKAGE_ITEMS ?? []) as PackageInsertionItem[],
    ]
    return items.filter(item => !query || [item.name, item.tag, item.packageName, item.kind]
      .filter(Boolean).join(" ").toLowerCase().includes(query))
  }

  get activeItem() {
    return this.filteredItems[this.activeIndex]
  }

  showAt(x: number, y: number) {
    this.setPosition(x, y)
    this.query = ""
    this.activeIndex = -1
    this.resetScrollPosition()
    this.open = true
  }

  setPosition(x: number, y: number) {
    this.style.left = `${Math.max(8, x)}px`
    this.style.top = `${Math.max(8, y)}px`
  }

  moveActive(direction: 1 | -1) {
    const items = this.filteredItems
    if(!items.length) return
    if(this.activeIndex < 0) {
      this.activeIndex = direction === 1? 0: items.length - 1
      return
    }
    this.activeIndex = (this.activeIndex + direction + items.length) % items.length
  }

  selectActive() {
    const item = this.activeItem
    if(item) this.choose(item)
  }

  protected willUpdate(changed: Map<string, unknown>) {
    if(changed.has("query")) {
      this.activeIndex = -1
    }
  }

  protected updated(changed: Map<string, unknown>) {
    if(changed.has("open") && this.open) this.resetScrollPosition()
  }

  private resetScrollPosition() {
    const sections = this.shadowRoot?.querySelector<HTMLElement>(".sections")
    if(sections) sections.scrollTop = 0
  }

  private choose(item: InsertionMenuItem) {
    this.dispatchEvent(new CustomEvent<InsertionMenuItem>("insertion-menu-select", {
      detail: item,
      bubbles: true,
      composed: true,
    }))
  }

  private chooseFromPointer(event: PointerEvent, item: InsertionMenuItem) {
    event.preventDefault()
    event.stopPropagation()
    this.choose(item)
  }

  private closeFromPointer(event: PointerEvent) {
    event.preventDefault()
    event.stopPropagation()
    this.close()
  }

  private close() {
    this.dispatchEvent(new Event("insertion-menu-close", {bubbles: true, composed: true}))
  }

  render() {
    const items = this.filteredItems
    return html`
      <div class="menu" ?hidden=${!this.open}>
        <button
          class="close"
          type="button"
          aria-label="Close element menu"
          title="Close"
          @pointerdown=${this.closeFromPointer}
          @click=${this.close}
        >×</button>
        <div class="sections">
          ${(["Text", "Lists", "Media", "Forms", "Packages"] as const).map(section => html`
            <section aria-label=${section}>
              <h2>${section}</h2>
              ${items.filter(item => item.section === section).map(item => html`
                <button
                  class="item"
                  type="button"
                  ?data-active=${items[this.activeIndex] === item}
                  @pointerdown=${(event: PointerEvent) => this.chooseFromPointer(event, item)}
                  @click=${() => this.choose(item)}
                >
                  <span class="item-icon" aria-hidden="true">
                    ${item.iconUrl ? html`<img src=${item.iconUrl} alt="" />` : ribbonIcon(item.section === "Packages" ? "Packages" : item.icon ?? item.name)}
                  </span>
                  <span class="item-text">
                    <span class="item-name">${item.name}</span>
                    ${item.packageName ? html`<span class="item-package">${item.packageName}</span>` : ""}
                  </span>
                </button>
              `)}
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
