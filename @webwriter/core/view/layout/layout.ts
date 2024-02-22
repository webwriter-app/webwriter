import { localized, msg } from "@lit/localize"
import {LitElement, html, css, PropertyValueMap} from "lit"
import {customElement, property, query, queryAssignedElements} from "lit/decorators.js"

@localized()
@customElement("ww-layout")
export class Layout extends LitElement {

  @property({type: Boolean, attribute: true})
  drawerLeftOpen: boolean = false

  @property({type: Boolean, attribute: true})
  drawerRightOpen: boolean = false

  @property({type: Boolean, attribute: true, reflect: true})
  foldOpen: boolean = false

  @property({type: Boolean, attribute: true, reflect: true})
  hideAsides: boolean = false

  @property({type: Boolean, attribute: true})
  loading: boolean = false
	
  render() {
    return html`
      <slot name="header-left"></slot>
      <sl-drawer placement="start" part="drawer-left" ?open=${this.drawerLeftOpen} exportparts="header: drawer-left-header, header-actions: drawer-left-header-actions, title: drawer-left-title, body: drawer-left-body, footer: drawer-left-footer" @sl-show=${(e: Event) => e.target === e.currentTarget && this.emitShowDrawer()} @sl-hide=${(e: Event) => e.target === e.currentTarget && this.emitHideDrawer()}>
        <slot name="drawer-left-body"></slot>
        <slot name="drawer-left-label" slot="label"></slot>
        <slot name="drawer-left-header-actions" slot="header-actions"></slot>
        <slot name="drawer-left-footer" slot="footer"></slot>
      </sl-drawer>
      <nav>
        <slot name="nav"></slot>
      </nav>
      <slot name="header-right" ?open=${this.drawerRightOpen}></slot>
      <sl-drawer placement="end" part="drawer-right" ?open=${this.drawerRightOpen} exportparts="header: drawer-right-header, header-actions: drawer-right-header-actions, title: drawer-right-title, body: drawer-right-body, footer: drawer-right-footer" @sl-show=${(e: Event) => e.target === e.currentTarget && this.emitShowDrawer()} @sl-hide=${(e: Event) => e.target === e.currentTarget && this.emitHideDrawer()}>
        <slot name="drawer-right-body"></slot>
        <slot name="drawer-right-label" slot="label"></slot>
        <slot name="drawer-right-header-actions" slot="header-actions"></slot>
        <slot name="drawer-right-footer" slot="footer"></slot>
      </sl-drawer>
      <slot name="fold"></slot>
      <slot name="main"></slot>
    `
  }

  static styles = css`
    :host {
      display: grid;
      grid-template-columns: 1fr 120px minmax(auto, 600px) 120px 1fr;
      grid-template-rows: minmax(50px, max-content) max-content 1fr;
      align-items: flex-start;
      height: 100vh;
      width: 100vw;
    }

    
    slot[name=header-left]::slotted(*) {
      min-height: 50px;
      grid-column: 1 / 3;
      grid-row: 1;
    }

    nav {
      min-height: 50px;
      grid-column: 3;
      grid-row: 1;
      position: relative;
      margin-bottom: -1px;
      z-index: 11;
      display: flex;
      flex-direction: row;
      overflow: hidden;
    }

    slot[name=header-right]::slotted(*) {
      min-height: 50px;
      overflow-y: visible;
      grid-column: 4 / 6;
      grid-row: 1;
    }

    slot[name=main]::slotted(:not([data-active]):not(#initializingPlaceholder)) {
      display: none !important;
    }

    slot[name=main]::slotted(#initializingPlaceholder) {
      grid-column: 1 / 6;
      grid-row: 1 / 5;
    }

    slot[name=fold]::slotted(*) {
      transition: cubic-bezier(0.23, 1, 0.320, 1) 0.75s;
      transition-property: max-height box-shadow;
      width: 100%;
      justify-self: end;
    }

    slot[name=fold]::slotted(*) {
      grid-row: 2;
      grid-column: 2 / 5; 
      background: white;
      // border: 1px solid lightgray;
      // border-top: 14px solid var(--sl-color-gray-100);
      // border-left: 0;
      // border-right: 0;
      max-height: 0;
    }

    :host(:not([foldopen])) slot[name=fold]::slotted(*) {
      max-height: 0;
    }

    slot[name=fold]::slotted(*:hover) {
      max-height: 56px !important;
      // box-shadow: 0 -14px 0 0 var(--sl-color-gray-100);
      // border: 1px solid lightgray !important;
    }

    :host([foldopen]) slot[name=fold]::slotted(*) {
      max-height: 60vh !important;
      border: 1px solid lightgray !important;
      // border: 1px solid lightgray !important;
    }

    :host([hideasides]) aside {
      display: none;
    }

    :host([hideasides]) main {
      grid-column: 1 / 5;
    }
  `

	@query("[part=tabs-wrapper]")
	tabsWrapper: HTMLElement

  @query("nav")
  nav: HTMLElement

  @queryAssignedElements({slot: "main"})
  panels: HTMLElement[] | null

  emitShowDrawer = () => this.dispatchEvent(
    new CustomEvent("ww-show-drawer", {composed: true, bubbles: true})
  )

  emitHideDrawer = () => this.dispatchEvent(
    new CustomEvent("ww-hide-drawer", {composed: true, bubbles: true})
  )
}