import { localized, msg } from "@lit/localize"
import {LitElement, html, css, PropertyValueMap} from "lit"
import {customElement, property, query, queryAssignedElements} from "lit/decorators.js"

@localized()
@customElement("ww-layout")
export class Layout extends LitElement {
	
  render() {
    return html`
      <slot name="header-left"></slot>
      <sl-drawer placement="start" part="drawer-left" ?open=${this.drawerLeftOpen} exportparts="header: drawer-left-header, header-actions: drawer-left-header-actions, title: drawer-left-title, body: drawer-left-body, footer: drawer-left-footer" @sl-show=${(e: Event) => e.target === e.currentTarget && this.emitShowDrawer()} @sl-hide=${(e: Event) => e.target === e.currentTarget && this.emitHideDrawer()}>
        <slot name="drawer-left-body"></slot>
        <slot name="drawer-left-label" slot="label"></slot>
        <slot name="drawer-left-header-actions" slot="header-actions"></slot>
        <slot name="drawer-left-footer" slot="footer"></slot>
      </sl-drawer>
      <nav @wheel=${this.handleTabScroll}>
        <slot name="nav" @slotchange=${this.handleTabSlotChange}></slot>
        ${this.tabs.length !== 0? this.TabControls(): null}
      </nav>
      <slot name="header-right" ?open=${this.drawerRightOpen}></slot>
      <sl-drawer placement="end" part="drawer-right" ?open=${this.drawerRightOpen} exportparts="header: drawer-right-header, header-actions: drawer-right-header-actions, title: drawer-right-title, body: drawer-right-body, footer: drawer-right-footer" @sl-show=${(e: Event) => e.target === e.currentTarget && this.emitShowDrawer()} @sl-hide=${(e: Event) => e.target === e.currentTarget && this.emitHideDrawer()}>
        <slot name="drawer-right-body"></slot>
        <slot name="drawer-right-label" slot="label"></slot>
        <slot name="drawer-right-header-actions" slot="header-actions"></slot>
        <slot name="drawer-right-footer" slot="footer"></slot>
      </sl-drawer>
      <slot name="main">
        ${this.Landing()}
      </slot>
    `
  }

  static styles = css`
    :host {
      display: grid;
      grid-template-columns: 1fr 40px minmax(auto, 800px) 1fr;
      grid-template-rows: 50px 1fr;
      height: 100vh;
      width: 100vw;
    }
    
    slot[name=header-left]::slotted(*) {
      grid-column: 1 / 3;
      grid-row: 1;
    }

    nav {
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
      grid-column: 4;
      grid-row: 1;
    }

    slot[name=main] .landing-tab {
      grid-column: 1 / 5;
      grid-row: 2;
      width: 100%;
    }

    slot[name=main]::slotted(:not([data-active]):not(#initializingPlaceholder)) {
      display: none !important;
    }

    slot[name=main]::slotted(#initializingPlaceholder) {
      grid-column: 1 / 5;
      grid-row: 1 / 5;
    }

    #tab-controls {
      position: sticky;
      right: 0;
      top: 0;
      width: max-content;
      display: flex;
      flex-direction: row;
      align-items: center;
      background: rgba(241, 241, 241, 0.9);
			box-shadow: 0 0 4px 4px rgba(241, 241, 241, 0.9);
    }

    .landing-tab {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      width: 100%;
      height: 100%;
      gap: 20px;
    }

    .landing-tab > * {
      width: 250px;
      background: white;
      display: flex;
      flex-direction: row;
      justify-content: space-evenly;
    }

    .landing-tab sl-button::part(base) {
      display: flex;
      flex-direction: row;
      justify-content: space-evenly;
    }

    .landing-tab sl-icon {
      font-size: 1.2rem;
    }

    :host([hideasides]) aside {
      display: none;
    }

    :host([hideasides]) main {
      grid-column: 1 / 5;
    }
  `

  Landing() {
    return html`<div class="landing-tab">
      <sl-button outline variant="neutral" @click=${this.emitNewTab}>
        <sl-icon slot="prefix" name="file-earmark-plus-fill"></sl-icon>
        <span>${msg("New document")}</span>
      </sl-button>
      <sl-button outline variant="neutral" @click=${this.emitOpenTab}>
        <sl-icon slot="prefix" name="file-earmark-arrow-up-fill"></sl-icon>
        <span>${msg("Open document")}</span>
      </sl-button>
    </div>`
  }

  TabControls() {
    return html`<div id="tab-controls">
      <sl-icon-button title=${msg("New document [CTRL+N]")} name="file-earmark-plus-fill" @click=${this.emitNewTab}></sl-icon-button>
      <sl-icon-button title=${msg("Open document [CTRL+O]")} name="file-earmark-arrow-up-fill" @click=${this.emitOpenTab}></sl-icon-button>
    </div>`
  }

  @property({type: Boolean})
  openTab: boolean

  @property({type: Boolean, attribute: true})
  drawerLeftOpen: boolean = false

  @property({type: Boolean, attribute: true})
  drawerRightOpen: boolean = false

  @property({type: Boolean, attribute: true, reflect: true})
  hideAsides: boolean = false

  @property({type: String})
  activeTabName: string | null = null

  @queryAssignedElements({slot: "nav"})
	tabs: HTMLElement[]

	@query("[part=tabs-wrapper]")
	tabsWrapper: HTMLElement

  @query("nav")
  nav: HTMLElement

  @queryAssignedElements({slot: "main"})
  panels: HTMLElement[] | null

  protected async updated(changed: Map<keyof Layout, any>) {
    if(changed.has("activeTabName")) {
      this.focusTab()
    }
  }

	emitNewTab = () => {
    this.dispatchEvent(
      new CustomEvent("ww-add-tab", {composed: true, bubbles: true})
    )
    setTimeout(this.focusTab, 75)
  }

	emitOpenTab = () => {
    this.dispatchEvent(
		  new CustomEvent("ww-open-tab", {composed: true, bubbles: true})
	  )
    setTimeout(this.focusTab, 75)
  }

  emitShowDrawer = () => this.dispatchEvent(
    new CustomEvent("ww-show-drawer", {composed: true, bubbles: true})
  )

  emitHideDrawer = () => this.dispatchEvent(
    new CustomEvent("ww-hide-drawer", {composed: true, bubbles: true})
  )

	async handleFocusIn(e: FocusEvent) {
		(e.composedPath()[0] as HTMLElement).scrollIntoView({behavior: "smooth", block: "center", inline: "center"})
	}

	handleKeyDown(e: KeyboardEvent) {
		if(e.key === "ArrowLeft") {
			this.selectPreviousTab()
		}
		else if (e.key === "ArrowRight") {
			this.selectNextTab()
		}
	}

	handleTabSlotChange = (e: Event) => {
    this.focusTab()
	}

  handleTabScroll = (e: WheelEvent) => {
    e.preventDefault()
    this.nav.scrollLeft += e.deltaY
    this.nav.scrollLeft += e.deltaX
  }

	selectPreviousTab() {
    const tab = this.tabs?.find(tab => tab.id === this.activeTabName)
		const previousTab = this.tabs[this.tabs.indexOf(tab as HTMLElement) - 1]
		previousTab?.focus()		
	}

	selectNextTab() {
    const tab = this.tabs?.find(tab => tab.id === this.activeTabName)
		const nextTab = this.tabs[this.tabs.indexOf(tab as HTMLElement) + 1]
		nextTab?.focus()
	}

  async focusTab() {
    await this.updateComplete
    const tab = this.tabs?.find(tab => tab.id === this.activeTabName)
    const panel = this.panels?.find(panel => panel.hasAttribute("data-active"))
    tab?.scrollIntoView({behavior: "smooth", block: "center", inline: "center"})
    panel?.focus()
  }
}