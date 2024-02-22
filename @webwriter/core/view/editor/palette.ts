import { msg } from "@lit/localize"
import { LitElement, Part, PropertyValueMap, css, html, noChange } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import { classMap } from "lit/directives/class-map.js"
import { ifDefined } from "lit/directives/if-defined.js"
import { EditorState, Command as PmCommand } from "prosemirror-state"
import {Directive, PartInfo, directive, ElementPart} from "lit/directive.js"

import { Package, watch } from "../../model"
import { unscopePackageName, prettifyPackageName, camelCaseToSpacedCase } from "../../utility"
import { SlDropdown, SlInput, SlMenu, SlPopup, SlProgressBar } from "@shoelace-style/shoelace"
import { Command } from "../../viewmodel"
import { App, PackageForm } from ".."
import { regex } from "parsimmon"
import { toJS } from "mobx"


// https://github.com/lit/lit-element/issues/1099#issuecomment-731614025
class FlipDirective extends Directive {


  static directive = directive(this)

  constructor(part: PartInfo) {
    super(part)
  }

  update(part: ElementPart, args: any[]) {
    const firstElement = part.element
    // Don't animate first render
    if (!firstElement.isConnected) {
      return;
    }
    // Capture render position before update
    const first = firstElement.getBoundingClientRect();
    // Nodes may be re-used so identify via a key.
    const idSelector = `#${firstElement.id}`
    const container = firstElement.parentElement
    requestAnimationFrame(() => {
      // Find matching element.
      const lastElement = container?.querySelector(idSelector);
      if (!lastElement) {
        return;
      }
      // Capture render position after update
      const last = lastElement.getBoundingClientRect();
      // Calculate deltas and animate if something changed.
      const topChange = first.top - last.top;
      if (topChange !== 0) {
        lastElement.animate(
          [{ transform: `translateY(${topChange}px)` }, {}],
          {duration: 100}
        );
      }
    });
    return noChange
  }

  render() {
    return null
  }
}

@customElement("ww-palette")
export class Palette extends LitElement {

  @property({attribute: false})
  app: App

	emitInsert = (pkgID: string, name: string) => {
		this.dispatchEvent(new CustomEvent("ww-insert", {composed: true, bubbles: true, detail: {pkgID, name}}))
	}

  emitAddWidget = (name: string) => {
		this.dispatchEvent(new CustomEvent("ww-add-widget", {composed: true, bubbles: true, detail: {name}}))
	}

  emitUpdateWidget = (name: string) => {
		this.dispatchEvent(new CustomEvent("ww-update-widget", {composed: true, bubbles: true, detail: {name}}))
	}

  emitRemoveWidget = (name: string) => {
		this.dispatchEvent(new CustomEvent("ww-remove-widget", {composed: true, bubbles: true, detail: {name}}))
	}

  emitWatchWidget = (name: string) => {
		this.dispatchEvent(new CustomEvent("ww-watch-widget", {composed: true, bubbles: true, detail: {name}}))
	}

	emitMouseInWidgetAdd = (name: string) => {
		this.dispatchEvent(new CustomEvent("ww-mousein-widget-add", {composed: true, bubbles: true, detail: {name}}))
	}

	emitMouseOutWidgetAdd = (name: string) => {
		this.dispatchEvent(new CustomEvent("ww-mouseout-widget-add", {composed: true, bubbles: true, detail: {name}}))
	}

	emitClose = () => {
		this.dispatchEvent(new CustomEvent("ww-close", {composed: true, bubbles: true}))
	}

	@property({type: Array, attribute: false})
	packages: Package[] = []

  @property({type: Object, attribute: false})
  editorState: EditorState

  @property({type: Object, attribute: false})
  activeElement: Element | null

	@property({state: true})
	addingWidget: string | null

	@property({type: Number, attribute: false})
	widgetAddProgress: number = 0

	@property({type: Boolean})
	showWidgetPreview: boolean

  @property({type: Boolean, reflect: true})
  managing = false

	widgetAddInterval: any
	
	@query(".package-card:hover sl-progress-bar")
	activeProgressBar: SlProgressBar

	static styles = css`

    :host {
      display: grid;
      grid-template-columns: repeat(10, 1fr);
      grid-auto-rows: 40px;
      max-width: 420px;
      z-index: 10000;
			padding: 0 10px;
      margin-left: auto;
      padding-bottom: 5px;
      gap: 5px;
      grid-auto-flow: row dense;
      max-height: 100%;
      overflow-y: auto;
      position: relative;
    }

    .inline-commands-wrapper {
      display: contents;
    }

    .package-card {
      z-index: -1;

      &::part(base) {
        --padding: 10px;
        min-width: 180px;
        height: 100%;
        position: relative;
        display: block;
      }

      &::part(body) {
        height: 100%;
        overflow-y: hidden;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;
        padding: 0;
      }

      & .title {
        display: flex;
        flex-direction: row;
        align-items: center;
        font-size: 0.9rem;
        height: 2ch;
        user-select: none;
        width: 100%;
        height: 100%;
        padding: 5px;
        box-sizing: border-box;
        & span {
          overflow: hidden;
          text-overflow: ellipsis;
          text-wrap: nowrap;
          width: calc(100%);
          display: block;
          box-sizing: border-box;
        }
      }

      &:hover {
        cursor: pointer;
        z-index: 100000;
      }

      &.error .title {
        color: var(--sl-color-danger-600);
      }

      & .error-button {
        color: var(--sl-color-danger-800);

        &:hover {
          color: var(--sl-color-danger-600);
        }
      } 

      &.error sl-tooltip {
        --max-width: 500px;
      }

      &:not(.error) .error-button {
        display: none;
      }

      & sl-progress-bar {
        width: 100%;
        --height: 2px;
        position: absolute;
        bottom: 0;
        left: 0;
      }

      & .package-tooltip {
        --show-delay: 750;
        --max-width: 200px;
      }

      & .package-tooltip::part(base__arrow) {
        color: var(--sl-color-gray-950);
        background: var(--sl-color-gray-950);
      }

      & .package-tooltip::part(body) {
        background: rgba(241, 241, 241, 0.95);
        border: 2px solid var(--sl-color-gray-400);
        color: var(--sl-color-gray-950);
        z-index: 100000;
      }
    }
    
    .inline-card {
      order: 2;
      &::part(base) {
        --padding: 10px;
        min-width: 100%;
        min-height: 100%;
        box-sizing: border-box;
      }

      & .title {
        justify-content: center;
      }
    }

    .block-card {
      order: 1;
      grid-column: span 5;

      &::part(body) {
        justify-content: flex-start;
        position: relative;
      }

      &:not(.installed):not(:hover) {
        color: var(--sl-color-gray-400);
        &::part(base) {
          background: var(--sl-color-gray-50);
          box-shadow: none;
        }
      }

      &.installed:not(.error) .title:hover {
        color: var(--sl-color-primary-600);
      }

      &:not(.installed):hover {
        color: var(--sl-color-success-700);
      }

      &:not(.outdated) .update {
        display: none;
      }

      &:is(.installed, :hover) .manage-controls {
        background: rgba(255, 255, 255, 0.85);
      }

      & .manage-controls {
        position: absolute;
        right: 0;
        top: 0;
        display: flex;
        flex-direction: row;
        justify-content: flex-end;
        align-items: stretch;
        height: 100%;
        margin-right: 5px;
      }

      & .manage::part(icon) {
        font-size: 20px;
        padding: 2px;
      }

      & .pin::part(base) {
        padding: 0;
      }

      &.installed .pin::part(base):hover, &.installed:has(.pin:hover) .title {
        color: var(--sl-color-danger-700) !important;
      }

      &:not(.installed) .pin::part(base):hover, &:not(.installed):has(.pin:hover) .title {
        color: var(--sl-color-success-700) !important;
      }

      & .update::part(base):hover, &:has(.update:hover) .title {
        color: var(--sl-color-warning-700) !important;
      }

      &:not(.installed):hover :is(.title, .pin::part(base):hover) {
        color: var(--sl-color-success-700) !important;
      }

      &.adding sl-progress-bar {
        --indicator-color: var(--sl-color-success-700);
      }

      &.updating sl-progress-bar {
        --indicator-color: var(--sl-color-warning-700);
      }

      &.removing sl-progress-bar {
        --indicator-color: var(--sl-color-danger-700);
      }

      &.found .title {
        font-weight: bold;
      }

      &:not(.local) .watch-button {
        display: none;
      }

      &.error .dropdown-trigger {
        display: none;
      }

      & .dropdown-trigger {
        &::part(base) {
          padding: 0;
          margin-right: 5px;
        }
      }
    }

    .container-card {
      order: 0;
      grid-row: span 2;

      &:hover {
        color: var(--sl-color-primary-600);
      }

      &::part(base) {
        min-width: unset;
      }

      & .title {
        justify-content: center;

        & sl-icon {
          --icon-size: 24px;
          width: 24px;
          height: 24px;
        }
      }
    }

    #package-toolbar {
      background: var(--sl-color-gray-100);
      z-index: 100;
      position: sticky;
      top: 0;
      left: 0;
      grid-row: 1;
      grid-column: span 10;
      display: flex;
      flex-direction: row;
      justify-content: flex-end;
      align-items: center;
      gap: 1ch;


      & #package-search {

        width: 100%;
        --sl-input-spacing-small: 3px;

        cursor: text;

        &::part(base) {
          background: none;
          padding: 0;
          position: relative;
        }

        &::part(clear-button) {
          font-size: 1.15rem;
          position: absolute;
          right: 0;
          top: 0;
          bottom: 0;
          margin: auto 0;
        }

        &::part(input) {
          width: 100%;
        }
      }

      & #package-button {
        position: relative;
        & #packages-spinner {
          font-size: 1.75rem;
          position: absolute;
          top: 0;
          left: 0;
        }
      }

      & sl-icon {
        cursor: text;
      }
    }

    .local-package-dialog {
      position: relative;
      & ww-button {
        align-self: center;
      }
    }

    :host([managing]) #package-button {
      background: var(--sl-color-primary-200);
      border-radius: 100%;
    }

    :host(:not([managing])) :is(#add-local, .package-card:not(.watching) .watch-button, .manage:not(.watch-button), .block-card:not(.installed)) {
      display: none;
    }

    :host(:not([managing])) .watch-button {
      margin-right: 2ch;
    }

    :host(:is([managing], :not(:hover))) .dropdown-trigger {
      visibility: hidden;
    }

    .package-card:not(.multiple) .dropdown-trigger {
      display: none;
    }
    

    .other-insertables-menu {
      padding: 0;

      & .applied-theme::part(label) {
        font-weight: bolder;
      }
    }

    .other-insertables-menu sl-menu-item::part(checked-icon) {
      display: none;
    }

    .other-insertables-menu sl-menu-item::part(submenu-icon) {
      display: none;
    }

    .other-insertables-menu sl-menu-item::part(base) {
      font-size: 0.9rem;
    }

    #clipboard-card {
      grid-column: span 10;

      &:hover {
        color: var(--sl-color-primary-600);
      }
    }

    #add-local {
      order: 10000;
      grid-column: span 5;
      user-select: none;

      &:hover {
        color: var(--sl-color-indigo-700);
      }

      &:not(:hover)::part(base) {
        background: none;
        box-shadow: none;
      }

      &::part(body) {
        display: flex;
        flex-direction: row;
        justify-content: center;
        gap: 1ch;
        font-size: 0.9rem;
        color: var(--sl-color-gray-800);
        padding-left: 0.5ch;
        padding-right: 0.5ch;
      }
    }

    .package-context-menu {
      z-index: 1000000;
      background: var(--sl-color-gray-100);
    }

    .error-content {
      font-size: 0.75rem;
      padding-right: 1ch;
    }

    @media only screen and (max-width: 1731px) {
      :host {
        grid-template-columns: repeat(5, 1fr);
      }

      #package-toolbar, #clipboard-card {
        grid-column: span 5;
      }
    }

    @media only screen and (max-width: 1300px) {
      :host {
				display: flex;
				flex-direction: row;
				align-items: stretch;
				background: #f1f1f1;
        padding-top: 5px;
				height: 60px;
        width: 100%;
				border-top: 1px solid lightgray;
				border-right: 1px solid lightgray;
				box-shadow: 0 -1px 2px hsl(240 3.8% 46.1% / 12%);;
				box-sizing: border-box;
				gap: 0.5rem;
				padding-right: 0;
        max-width: unset;
        overflow-x: scroll;
        // overflow-y: hidden;
      }

      :host(:not([managing])) .watch-button {
        display: none;
      }

      .package-card {
        flex-shrink: 0;

        &::part(base) {
          min-width: unset;
        }

        & .manage::part(icon) {
          font-size: 16px;
        }

        &:not(:hover) .manage {
          display: none;
        }
        
        & .dropdown-trigger {
          transform: rotate(180deg);
        }
      }

      .container-card {
        & .title {
          & sl-icon {
            --icon-size: 16px;
            width: 16px;
            height: 16px;
          }
        }
      }
      #add-local {
        margin-right: 1ch;
      }

      #package-search:not(:focus-within)[data-invalid] {
        aspect-ratio: 1/1;
        width: unset !important;
        height: 100%;
      }
      
      #package-search:is(:focus-within, :not([data-invalid])) {
        min-width: 200px;
      }
    }

		
    /*

		@media only screen and (max-width: 1300px) {

      .container-choices {
        flex-wrap: nowrap;
        order: -1;
      }

      .package-card:not(.container-card)::part(base) {
        width: unset;
        padding: 0 0.5ch;
      }
		}

		@media only screen and (min-width: 1301px) {
			:host {
				display: block;
				height: calc(100vh - 49px);
				padding: 0;
			}

			[part=widget-choices] {
				display: flex;
				flex-direction: column-reverse;
				flex-wrap: wrap;
				align-items: flex-end;
				justify-content: flex-end;
				overflow-x: auto;
				overflow-y: hidden;
				height: calc(100vh - 49px - 50px);
				gap: 0 10px;
				padding: 10px;
				box-sizing: border-box;
			}

			[part=widget-choices] > * {
				display: block;
			}

		}

    */
	`

	private handleClickCard(pkg: Package | Command, snippetName?: string) {
    const isLeaf = "name" in pkg
    const hasIssues = this.app.store.packages.getPackageIssues(pkg.id).length
		if(isLeaf) {
      if(!pkg.installed) {
        this.emitAddWidget(pkg.name)
      }
      else if(hasIssues) {
        this.errorPkg = pkg
      }
      else {
        this.emitInsert(pkg.id, snippetName!)
      }
		}
    else if(!isLeaf && !pkg.disabled) {
      this.addingWidget = pkg.id;
      (pkg as Command).run()
    }
	}

	static FormattedError(pkg: Package, issues: Error []) {
    const esbuildPathRegex = new RegExp(`^\\s*(?:[^/]+\/)+(${pkg.name.replaceAll("/", "\\\/")}\/(?:[^/]+\\/)+[^/]+\\d+:\\d+:)`, "g")
		return issues.map(err => err.message
			?.replaceAll("X [ERROR] ", "")
			// ?.replaceAll(/\n\d* error(s)?/g, "")
      ?.replaceAll(esbuildPathRegex, "$1")
			.trim()
    ).join("\n")
	}

	handleMouseInWidgetAdd = (pkg: Package | Command) => {
    const isLeaf = "name" in pkg
		if(isLeaf && this.showWidgetPreview) {
			this.addingWidget = pkg.name
			this.widgetAddInterval = setInterval(async () => {
				this.widgetAddProgress = Math.min(150, this.widgetAddProgress + 15)
				if(this.widgetAddProgress === 150) {
					clearInterval(this.widgetAddInterval)
          isLeaf
            ? this.emitMouseInWidgetAdd(unscopePackageName(this.addingWidget!))
            : (pkg as Command).run()
				}
			}, 50)
		}
	}

	handleMouseOutWidgetAdd = (name: string) => {
		this.widgetAddProgress = 0
		this.addingWidget = null
    this.dropdownOpen = null
		clearInterval(this.widgetAddInterval)
		this.emitMouseOutWidgetAdd(name)
	}

  ContainerCard = (cmds: Command[]) => {
    const cmd = cmds[(cmds.findIndex(cmd => cmd.active) + 1) % cmds.length]
    return html`<sl-card class=${classMap({"package-card": true, "container-card": true})} ?inert=${cmd.disabled} @click=${() => this.handleClickCard(cmd)} @mouseenter=${() => this.handleMouseInWidgetAdd(cmd)} @mouseleave=${() => this.handleMouseOutWidgetAdd(unscopePackageName(cmd.id))}>
		<sl-tooltip placement="left-start" class="package-tooltip" hoist trigger="hover">
			<span class="title">
			  <sl-icon class="container-icon" name=${cmd.icon ?? "square"}></sl-icon>
			</span>
      <span slot="content">
        <b><code>${cmd.label}</code></b>
        <div>${cmd.description || msg("No description provided")}</div>
      </span>
		</sl-tooltip>
		<sl-progress-bar value=${cmd.id === this.addingWidget? this.widgetAddProgress: 0}></sl-progress-bar>
	</sl-card>`
  }

  @query(".other-insertables")
  otherInsertables: SlPopup

  @property({state: true})
  dropdownOpen: string | null = null

	BlockCard = (pkg: Package) => {
    const {watching, name, version, installed, outdated, localPath} = pkg
    const adding = !!this.app.store.packages.adding[name]
    const removing = !!this.app.store.packages.removing[name]
    const updating = !!this.app.store.packages.updating[name]
    const changing = adding || removing || updating
    const found = name in this.searchResults
    const error = this.app.store.packages.getPackageIssues(pkg.id).length
    const insertables = this.app.store.packages.insertables[pkg.id]
    const {name: firstName, label: firstLabel} = insertables[0] ?? {}
    const otherInsertables = insertables.slice(1)
    return html`<sl-card id=${pkg.id} @contextmenu=${(e: any) => {this.contextPkg = pkg; e.preventDefault()}} data-package-name=${name} @mouseenter=${() => this.handleMouseInWidgetAdd(pkg)} @mouseleave=${() => {this.handleMouseOutWidgetAdd(unscopePackageName(name))}} class=${classMap({"package-card": true, "block-card": true, installed: !!installed, error, adding, removing, updating, outdated, watching: !!watching, found, local: !!localPath, multiple: insertables.length > 1})} ?inert=${changing}>
		<sl-tooltip placement="left-start" class="package-tooltip" hoist trigger="hover">
			<span class="title" @click=${() => this.handleClickCard(pkg, firstName)}>${firstLabel?._ ?? prettifyPackageName(pkg.name)}</span>
      <span slot="content">
        <b><code>${name} ${version}</code></b>
        <div>${pkg.description || msg("No description provided")}</div>
      </span>
      <aside class="manage-controls">
        <ww-button variant="icon" class="watch-button manage" icon=${watching? "bolt-filled": "bolt"} @click=${(e: any) => {this.emitWatchWidget(pkg.name); e.stopPropagation()}}></ww-button>
        <!--<ww-button variant="icon" class="error-button" icon="bug" @click=${() => this.errorPkg = pkg}></ww-button>-->
        <ww-button title=${msg("Update this widget package")} class="manage update" variant="icon" icon="download" @click=${(e: any) => {this.emitUpdateWidget(pkg.name); e.stopPropagation()}}></ww-button>
        <ww-button title=${pkg.installed? msg("Remove this widget package"): msg("Install this widget package")} class="manage pin" variant="icon" icon=${pkg.installed? "trash": "download"} @click=${(e: any) => {!pkg.installed? this.emitAddWidget(pkg.name): this.emitRemoveWidget(pkg.name); e.stopPropagation()}}></ww-button>
      </aside>
      <ww-button variant="icon" class="dropdown-trigger" icon=${!this.dropdownOpen? "chevron-down": "chevron-up"} @click=${(e: any) => this.dropdownOpen = this.dropdownOpen? null: pkg.id} @mouseenter=${() => this.dropdownOpen = pkg.id}></ww-button>
      <sl-popup flip anchor=${pkg.id} class="other-insertables" strategy="fixed" placement="bottom-end" sync="width" ?active=${this.dropdownOpen === pkg.id}>
        <sl-menu class="other-insertables-menu">
          ${otherInsertables.map(v => html`<sl-menu-item class=${classMap({"applied-theme": pkg.id + v.name.slice(1) === this.app.store.document.themeName})} @click=${() => this.handleClickCard(pkg, v.name)}>
            ${v.label!._}
          </sl-menu-item>`)}
        </sl-menu>
      </sl-popup>
		</sl-tooltip>
		<sl-progress-bar ?indeterminate=${changing}></sl-progress-bar>
	</sl-card>`
  }

  InlineCard = (cmd: Command) => {
    const {id, label} = cmd
    return html`<sl-card class=${classMap({"package-card": true, "inline-card": true})}>
		<sl-tooltip placement="left-start" class="package-tooltip" hoist trigger="hover">
			<span @click=${() => this.handleClickCard(cmd)} class="title" @mouseenter=${() => this.handleMouseInWidgetAdd(cmd)} @mouseleave=${() => this.handleMouseOutWidgetAdd(unscopePackageName(id))}>
			  <sl-icon class="container-icon" name=${cmd?.icon ?? "square"}></sl-icon>
			</span>
      <span slot="content">
        <b><code>${label}</code></b>
        <div>${cmd.description || msg("No description provided")}</div>
      </span>
		</sl-tooltip>
		<sl-progress-bar value=${id === this.addingWidget? this.widgetAddProgress: 0}></sl-progress-bar>
	</sl-card>`
  }

  Card = (cmdOrPkg: Command | Command[] | Package) => {
    if("name" in cmdOrPkg) {
      return this.BlockCard(cmdOrPkg)
    }
    else if(Array.isArray(cmdOrPkg)) {
      return this.ContainerCard(cmdOrPkg)
    }
    else if(cmdOrPkg.tags?.includes("inline")) {
      return this.InlineCard(cmdOrPkg)
    }
    else {
      return null
    }
  }

  @property({attribute: false, state: true})
  searchResults: Record<string, ReturnType<typeof this.app.store.packages.searchIndex.search>[number]> = {}


  handleSearchInput = async (e: CustomEvent) => {
    const query = (e.target as any).value
    this.searchResults = Object.fromEntries(this.app.store.packages.searchPackages(query).map(r => [r.id, r]))
  }

  get packagesInSearchOrder() {
    return [...this.packages].sort((a, b) => {
      const aScore = this.searchResults[a.name]?.score ?? 0
      const bScore = this.searchResults[b.name]?.score ?? 0
      return bScore - aScore
    })
  }

  @query("#package-search")
  packageSearch: SlInput

  PackageToolbar() {
    return html`<div id="package-toolbar">
      <sl-input id="package-search" required type="search" size="small" @sl-input=${this.handleSearchInput} @focus=${() => this.managing = true} clearable>
        <sl-icon slot="prefix" name="search" @click=${(e: any) => this.packageSearch.focus()}></sl-icon>
      </sl-input>
      <ww-button title=${msg("Manage packages")} .issues=${this.app.store.packages.managementIssues} id="package-button" variant="icon" icon="packages" @click=${() => {this.managing = !this.managing; this.managing && this.app.store.packages.load()}}>
        ${!this.app.store.packages.loading? null: html`
          <sl-spinner id="packages-spinner"></sl-spinner>
        `}
      </ww-button>
    </div>`
  }

  AddLocalPackageButton() {
    const importingName = this.app.store.packages.importingName
    return html`<sl-card id="add-local" class=${classMap({"package-card": true})} @click=${() => this.packageFormMode = "create"} ?inert=${!!importingName}>
      <sl-icon name="plus"></sl-icon>
      <div>${importingName? prettifyPackageName(importingName): msg(" Create/import")}</div>
      <sl-progress-bar ?indeterminate=${!!importingName}></sl-progress-bar>
    </span>
	</sl-card>`
  }

  ClipboardCard() {
    return html`<sl-card id="clipboard-card" class=${classMap({"package-card": true})} @click=${() => this.emitInsert("@webwriter/core", "clipboard")}>
      <sl-icon name="clipboard"></sl-icon>
      <sl-progress-bar></sl-progress-bar>
    </span>
	</sl-card>`
  }

  @property({state: true})
  contextPkg?: Package

  @property({state: true})
  errorPkg?: Package

  get contextPkgCard() {
    return this.shadowRoot?.querySelector(`[data-package-name='${this.contextPkg?.name}']`)
  }

  PackageContextMenu() {
    const pkg = this.contextPkg
    return !pkg? null: html`<sl-popup ?active=${!!pkg} .anchor=${this.contextPkgCard} placement="left-start" flip strategy="fixed" arrow distance=${8}>
      <sl-menu class="package-context-menu">
        <sl-menu-item class="insert-action" ?disabled=${!pkg.installed}>
          <sl-icon slot="prefix" name="plus"></sl-icon>
          <span>${msg("Insert widget")}</span>
        </sl-menu-item>
        <sl-menu-item class="install-action">
          <sl-icon slot="prefix" name=${pkg.installed? "trash": "download"}></sl-icon>
          <span>${pkg.installed? msg("Uninstall"): msg("Install")}</span>
        </sl-menu-item>
        <sl-menu-item class="update-action">
          <sl-icon slot="prefix" name=${"download"}></sl-icon>
          <span>${msg("Update")}</span>
        </sl-menu-item>
      </sl-menu>
    </sl-popup>`
  }

  @property({state: true})
  packageFormMode?: "create" | "edit"

  @query("ww-package-form")
  packageForm: PackageForm

  submitLocalPackage = async (e: Event) => {
    const packageForm = e.target as PackageForm
    const pkg = new Package(packageForm.value, packageForm.editingState)
    const options = this.packageFormMode === "edit"
      ? {
        mergePackage: true
      }
      : {
        preset: packageForm.preset,
        generateLicense: packageForm.generateLicense,
        overwrite: false,
        mergePackage: true
      }
    this.packageFormMode = undefined
    if(packageForm.changed) {
      await this.app.store.packages.writeLocal(pkg.localPath!, pkg, options)
    }
    await this.app.store.packages.add(`file://${pkg.localPath!}`, pkg.name)
    if(packageForm.editingState.watching) {
      this.emitWatchWidget(pkg.name)
    } 
    this.packageForm.reset()
  }

  async handlePackageFormPickPath(e: CustomEvent) {
    let localPath = await this.app.store.Dialog.promptRead({directory: true}) as string
    this.packageForm.localPath = localPath ?? this.packageForm.localPath
    this.handlePackageFormChangeField(new CustomEvent("ww-change-field", {detail: {name: "localPath", valid: true}}))
  }

  async handlePackageFormChangeField(e: CustomEvent) {
    if(e.detail.name === "localPath" && this.packageFormMode === "edit" && e.detail.valid) {
      this.fillPackageFormWithLocal()
    }
    else if(e.detail.name === "localPath" && this.packageFormMode === "create" && e.detail.valid) {
      const basename = await this.app.store.Path.basename(this.packageForm.localPath)
      const dirname = await this.app.store.Path.basename(await this.app.store.Path.dirname(this.packageForm.localPath))
      const possibleName = `@${dirname.replace("@", "")}/${basename}`
      this.packageForm.name = this.packageForm.name || possibleName
    }
  }

  async fillPackageFormWithLocal() {
    try {
      const pkgKeys = ["name", "license", "version", "author", "keywords"] as const
      const localPath = this.packageForm.localPath
      const pkg = await this.app.store.packages.readLocal(localPath)
      const localValue = {} as any
      pkgKeys.forEach(key => {
        localValue[key] = pkg[key] ?? "" as any
      })
      const newValue = {...this.packageForm.value, ...localValue}
      this.packageForm.defaultValue = this.packageForm.value = newValue
      
    }
    catch(err) {
      this.packageForm.reset()
    }
  }

  LocalPackageDialog() {
    return html`<sl-dialog
      class="local-package-dialog"
      ?open=${!!this.packageFormMode}
      @sl-after-hide=${() => {this.packageFormMode = undefined; this.packageForm.reset(true)}}>
      <sl-radio-group
        slot="label"
        value=${this.packageFormMode!}
        @sl-change=${(e: any) => this.packageFormMode = e.target.value}>
        <sl-radio-button value="create">
          ${msg("Create package")}
        </sl-radio-button>
        <sl-radio-button value="edit">
          ${msg("Import package")}
        </sl-radio-button>
      </sl-radio-group>
      <ww-package-form
        mode=${ifDefined(this.packageFormMode)}
        @submit=${this.submitLocalPackage}
        @ww-pick-path=${this.handlePackageFormPickPath}
        @ww-change-field=${this.handlePackageFormChangeField}
        @ww-cancel=${(e: any) => {this.packageFormMode = undefined; this.packageForm.reset(true)}}
      ></ww-package-form>
    </sl-dialog>`
  }

  ErrorDialog() {
    const issues = this.errorPkg? this.app.store.packages.getPackageIssues(this.errorPkg.id): []
    return html`<sl-dialog ?open=${!!this.errorPkg} @sl-after-hide=${() => this.errorPkg = undefined} label=${msg("Error importing ") + this.errorPkg?.name ?? ""}>
      <pre class="error-content">${issues.map(issue => issue.cause)}</pre>
    </sl-dialog>`
  }

  protected firstUpdated() {
    this.app.activeEditor?.addEventListener("change", () => this.managing = false)
  }

	render() {
    return html`
      ${this.PackageToolbar()}
      ${this.app.commands.groupedContainerCommands.map(this.Card)}
      ${this.ClipboardCard()}
      ${this.packagesInSearchOrder.map(this.Card)}
      ${this.AddLocalPackageButton()}
      ${this.LocalPackageDialog()}
      ${this.ErrorDialog()}
    `
	}
}