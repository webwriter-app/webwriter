import { msg } from "@lit/localize"
import { LitElement, Part, PropertyValueMap, css, html, noChange } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import { classMap } from "lit/directives/class-map.js"
import { ifDefined } from "lit/directives/if-defined.js"
import { EditorState, Command as PmCommand } from "prosemirror-state"
import {Directive, PartInfo, directive, ElementPart} from "lit/directive.js"

import { MemberSettings, Package, SemVer, watch } from "../../model"
import { unscopePackageName, prettifyPackageName, camelCaseToSpacedCase, filterObject } from "../../utility"
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

	emitMouseenterInsertable = (name: string, id: string) => {
		this.dispatchEvent(new CustomEvent("ww-mouseenter-insertable", {composed: true, bubbles: true, detail: {name, id}}))
	}

	emitMouseleaveInsertable = (name: string, id: string) => {
		this.dispatchEvent(new CustomEvent("ww-mouseleave-insertable", {composed: true, bubbles: true, detail: {name, id}}))
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

  @property({type: Boolean, attribute: true, reflect: true})
  managing = false

  @property({type: String, attribute: true, reflect: true})
  editingStatus: string

	widgetAddInterval: any
	
	@query(".package-card:hover sl-progress-bar")
	activeProgressBar: SlProgressBar

  connectedCallback(): void {
    super.connectedCallback()
    if(WEBWRITER_ENVIRONMENT.engine.name === "WebKit") {
      const sheet = new CSSStyleSheet()
      sheet.replaceSync(`:host { padding-right: 10px; overflow-y: auto; height: 100% !important}`)
      this.shadowRoot!.adoptedStyleSheets = [...this.shadowRoot!.adoptedStyleSheets, sheet]
      this.requestUpdate()
    }
  }

	static styles = css`

    :host {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      grid-auto-rows: 40px;
      max-width: 500px;
      margin-left: auto;
      padding-right: 10px;
      padding-bottom: 5px;
      gap: 4px;
      grid-auto-flow: row dense;
      max-height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
      position: relative;
      scrollbar-width: thin;
      box-sizing: border-box;
    }

    .inline-commands-wrapper {
      display: contents;
    }

    .package-card {

      &.local {
        font-style: italic;
      }

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
        word-wrap: break-word;
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

    .block-card, .snippet-card {
      order: 1;
      grid-column: span 6;

      &::part(body) {
        justify-content: flex-start;
        position: relative;
      }

      &:not(.installed):not(.snippet-card):not(:hover) {
        color: var(--sl-color-gray-400);
        &::part(base) {
          background: var(--sl-color-gray-50);
          box-shadow: none;
        }
      }

      &:is(.installed, .snippet-card):not(.error) .title:hover {
        color: var(--sl-color-primary-600);
      }

      &:not(.installed):not(.error):not(.snippet-card):hover {
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

      & 

      & .pin::part(base) {
        padding: 0;
      }

      &.installed .pin::part(base):hover, &.installed:has(.pin:hover) .title {
        color: var(--sl-color-danger-700) !important;
      }

      &:not(.installed):not(.error):not(.snippet-card) .pin::part(base):hover, &:not(.installed):has(.pin:hover) .title {
        color: var(--sl-color-success-700) !important;
      }

      & .update::part(base):hover, &:is(:has(.update:hover), :has(.unpin:hover)) .title {
        color: var(--sl-color-warning-700) !important;
      }

      &:not(.installed):not(.error):not(.snippet-card):hover :is(.title, .pin::part(base):hover) {
        color: var(--sl-color-success-700) !important;
      }

      &.snippet-card .unpin::part(base):hover {
        color: var(--sl-color-danger-700) !important;
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
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        position: relative;

        & .container-icon {
          --icon-size: 24px;
          width: 24px;
          height: 24px;
        }

        & .dropdown-trigger {
          position: absolute;
          bottom: 4px;
        }

        & .dropdown-trigger::part(icon) {
          --icon-size: 16px;
          width: 16px;
          height: 16px;
          color: var(--sl-color-gray-600);
        }
      }

      & .sub-command {

        &::part(label) {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 1ch;
          padding-right: 0.5ch;
        }

        & .container-icon {
          --icon-size: 20px;
          width: 20px;
          height: 20px;
        }
      }
    }

    .snippet-card {
      grid-column: span 6;
    }

    #pin-preview {
      background: none;
      font-weight: bold;
      color: var(--sl-color-primary-700);
      grid-column: span 6;

      & .title {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
      }
    }

    #package-toolbar {
      background: var(--sl-color-gray-100);
      z-index: 100;
      position: sticky;
      top: 0;
      left: 0;
      grid-row: 1;
      grid-column: span 12;
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

    .container-card:not(.multiple) .dropdown-trigger {
      visibility: hidden,
    }

    .package-card:not(.multiple) .dropdown-trigger {
      display: none;
    }

    .other-insertables-menu {
      padding: 0;
      overflow-y: auto;
      scrollbar-width: thin;
      max-height: var(--auto-size-available-height);

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

      grid-row: span 2;

      &::part(base) {
        min-width: unset;
        color: var(--sl-color-gray-600);
      }

      &::part(base):hover {
        color: var(--sl-color-primary-600);
      }
    }

    #add-local {
      order: 10000;
      grid-column: span 6;
      user-select: none;

      &:hover {
        color: var(--sl-color-indigo-700);
      }

      &:not(:hover)::part(base) {
        background: none;
        box-shadow: none;
      }

      &[data-disabled] {
        cursor: not-allowed;
        opacity: 0.75;
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

    .error-pane {
      font-size: 0.75rem;
      margin-bottom: 1.5rem;
    }

    .error-content {
      padding-right: 1ch;
    }

    @media only screen and (max-width: 1830px) {
      :host {
        grid-template-columns: repeat(6, 1fr);
      }

      #package-toolbar {
        grid-column: span 6;
      }
    }

    @media only screen and (max-width: 1360px) {
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
        scrollbar-width: thin;
        padding-left: 5px;
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

        &.error {
          cursor: help;
        }

        &.error .pin {
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

        & .dropdown-trigger::part(icon) {
          visibility: hidden;
        }
      }
      #add-local {
        margin-right: 1ch;
      }

      #package-search:not(:focus-within)[data-invalid] {
        width: 2.125ch !important;
      }
      
      #package-search:is(:focus-within, :not([data-invalid])) {
        min-width: 200px;
      }
    }

    :host([managing]) #package-search {
      min-width: 200px;
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
    if(isLeaf && pkg.isSnippet) {
      return this.emitInsert(pkg.id, "")
    }
    else if(!snippetName && isLeaf && !this.managing) {
      this.dropdownOpen = pkg.id
      return
    }
    const hasIssues = this.app.store.packages.getPackageIssues(pkg.id).length
		if(isLeaf) {
      if(hasIssues) {
        this.errorPkg = pkg
      }
      else if(!pkg.installed) {
        this.emitAddWidget(pkg.id)
      }
      else {
        this.emitInsert(pkg.id, snippetName!)
        this.managing = false
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

	handleMouseenterInsertable = (pkg: Package | Command) => {
    this.emitMouseenterInsertable("name" in pkg? pkg.name: pkg.id, pkg.id)
	}

	handleMouseleaveInsertable = (pkg: Package | Command) => {
    this.dropdownOpen = null
    this.emitMouseleaveInsertable("name" in pkg? pkg.name: pkg.id, pkg.id)
	}

  ContainerCard = (cmds: Command[]) => {
    const cmd = cmds[0]
    return html`<sl-card id=${cmd.group ?? cmd.id} class=${classMap({"package-card": true, "container-card": true, "multiple": cmds.length > 1})} ?inert=${cmd.disabled} @click=${() => this.handleClickCard(cmd)} @mouseenter=${() => this.handleMouseenterInsertable(cmd)} @mouseleave=${() => this.handleMouseleaveInsertable(cmd)}>
		<sl-tooltip placement="left-start" class="package-tooltip" hoist trigger="hover">
			<span class="title">
			  <sl-icon class="container-icon" name=${cmd.icon ?? "square"}></sl-icon>
        <ww-button variant="icon" class="dropdown-trigger" icon=${this.dropdownOpen !== cmd.group? "chevron-down": "chevron-up"} @click=${(e: any) => this.dropdownOpen = this.dropdownOpen? null: cmd.group!} @mouseenter=${() => this.dropdownOpen = cmd.group!}></ww-button>
			</span>
      <span slot="content">
        <b><code>${cmd.label}</code></b>
        <div>${cmd.description || msg("No description provided")}</div>
      </span>
		</sl-tooltip>
    <sl-popup flip anchor=${cmd.group ?? cmd.id} class="other-insertables" strategy="fixed" placement="bottom-start" ?active=${this.dropdownOpen === cmd.group} auto-size="both" auto-size-padding=${1}>
        <sl-menu class="other-insertables-menu">
          ${cmds.map(c => html`<sl-menu-item class="sub-command" @click=${(e: any) => {this.handleClickCard(c); e.stopPropagation()}}>
            <sl-icon class="container-icon" name=${c.icon ?? "square"}></sl-icon>
            ${c.label}
          </sl-menu-item>`)}
        </sl-menu>
      </sl-popup>
		<sl-progress-bar value=${cmd.id === this.addingWidget? this.widgetAddProgress: 0}></sl-progress-bar>
	</sl-card>`
  }

  @query(".other-insertables")
  otherInsertables: SlPopup

  @property({state: true})
  dropdownOpen: string | null = null

	BlockCard = (pkg: Package) => {
    const {watching, id, name, version, installed, outdated, localPath, packageEditingSettings} = pkg
    const {packages} = this.app.store
    const adding = !!packages.adding[id]
    const removing = !!packages.removing[id]
    const updating = !!packages.updating[id]
    const changing = adding || removing || updating
    const found = name in this.searchResults
    const error = packages.getPackageIssues(pkg.id).length
    const members = packages.getPackageMembers(pkg.id)
    const insertables = members? Object.values(filterObject(members, (_, ms) => !(ms as any).uninsertable) as unknown as Record<string, MemberSettings>): []
    const pkgEditingSettings = !packageEditingSettings? undefined: {name: undefined, label: undefined, ...packageEditingSettings}
    const {name: firstName, label: firstLabel} =  pkgEditingSettings ?? insertables[0] ?? {}
    const otherInsertables = insertables.slice(1)
    return html`<sl-card id=${pkg.id} @contextmenu=${(e: any) => {this.contextPkg = pkg; e.preventDefault()}} data-package-name=${name} @mouseenter=${() => this.handleMouseenterInsertable(pkg)} @mouseleave=${() => this.handleMouseleaveInsertable(pkg)} class=${classMap({"package-card": true, "block-card": true, installed: !!installed, error, adding, removing, updating, outdated, watching: !!watching, found, local: !!localPath, multiple: insertables.length > 1})} ?inert=${changing}>
		<sl-tooltip placement="left-start" class="package-tooltip" hoist trigger="hover">
			<span class="title" @click=${() => this.handleClickCard(pkg, firstName)}>${firstLabel?._ ?? prettifyPackageName(pkg.name)}</span>
      <span slot="content">
        <b><code>${name} ${version}</code></b>
        <div>${pkg.description || (error? "- " + msg("Error reading this package") + " -": null) || msg("No description provided")}</div>
      </span>
      <aside class="manage-controls">
        <!--<ww-button variant="icon" class="watch-button manage" icon=${watching? "bolt-filled": "bolt"} @click=${(e: any) => {this.emitWatchWidget(pkg.id); e.stopPropagation()}}></ww-button>-->
        <!--<ww-button variant="icon" class="error-button" icon="bug" @click=${() => this.errorPkg = pkg}></ww-button>-->
        <ww-button title=${msg("Update this widget package")} class="manage update" variant="icon" icon="download"  @focusin=${(e: any) => {e.preventDefault(); e.stopPropagation()}} @click=${(e: any) => {this.emitUpdateWidget(pkg.id); e.stopPropagation(); e.preventDefault()}}></ww-button>
        <ww-button title=${pkg.installed? msg("Remove this widget package"): msg("Install this widget package")} class="manage pin" @focusin=${(e: any) => {e.preventDefault(); e.stopPropagation()}} variant="icon" icon=${pkg.installed? "trash": "download"} @click=${(e: any) => {!pkg.installed? !error && this.emitAddWidget(pkg.id): this.emitRemoveWidget(pkg.id); e.stopPropagation(); e.preventDefault()}}></ww-button>
      </aside>
      <ww-button variant="icon" class="dropdown-trigger" icon=${this.dropdownOpen !== pkg.id? "chevron-down": "chevron-up"} @click=${(e: any) => this.dropdownOpen = this.dropdownOpen? null: pkg.id} @mouseenter=${() => this.dropdownOpen = pkg.id}></ww-button>
      <sl-popup flip anchor=${pkg.id} class="other-insertables" strategy="fixed" placement="bottom-end" sync="width" ?active=${this.dropdownOpen === pkg.id} auto-size="both" auto-size-padding=${1}>
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

  SnippetCard = (pkg: Package) => {
    const {name} = pkg
    return html`<sl-card class=${classMap({"package-card": true, "snippet-card": true})}>
      <span @click=${() => this.handleClickCard(pkg)} class="title" @mouseenter=${() => this.handleMouseenterInsertable(pkg)} @mouseleave=${() => this.handleMouseleaveInsertable(pkg)}>
        <span>${prettifyPackageName(name)}</span>
        <ww-button title=${msg("Unpin this snippet")} ?inert=${!this.managing} class="unpin" variant="icon" icon=${this.managing? "trash": "pinned-filled"}  @focusin=${(e: any) => {e.preventDefault(); e.stopPropagation()}} @click=${(e: any) => {this.app.store.packages.removeSnippet(name.split("-")[1]); e.stopPropagation(); e.preventDefault()}}></ww-button>
			</span>
		<sl-progress-bar></sl-progress-bar>
	</sl-card>`
  }

  InlineCard = (cmd: Command) => {
    const {id, label} = cmd
    return html`<sl-card class=${classMap({"package-card": true, "inline-card": true})}>
		<sl-tooltip placement="left-start" class="package-tooltip" hoist trigger="hover">
			<span @click=${() => this.handleClickCard(cmd)} class="title" @mouseenter=${() => this.handleMouseenterInsertable(cmd)} @mouseleave=${() => this.handleMouseleaveInsertable(cmd)}>
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
    if("name" in cmdOrPkg && cmdOrPkg.isSnippet) {
      return this.SnippetCard(cmdOrPkg)
    }
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
      <sl-input id="package-search" placeholder=${!this.app.store.packages.installed.length? msg("Find packages..."): ""} required type="search" size="small" @sl-input=${this.handleSearchInput} @focus=${() => this.managing = true} clearable>
        <sl-icon slot="prefix" name="search" @click=${(e: any) => this.packageSearch.focus()}></sl-icon>
      </sl-input>
      <ww-button title=${msg("Reload packages")} .issues=${this.app.store.packages.managementIssues} id="package-button" variant="icon" icon="packages" @click=${(e: any) => {this.managing = !this.managing; this.managing && this.app.store.packages.load()}}>
        ${!this.app.store.packages.loading? null: html`
          <sl-spinner id="packages-spinner"></sl-spinner>
        `}
      </ww-button>
    </div>`
  }

  AddLocalPackageButton() {
    const importingName = this.app.store.packages.importingName
    const disabled = !this.app.store.accounts.getClient("file", "file")?.showOpenFilePickerSupported
    return html`<sl-card id="add-local" class=${classMap({"package-card": true})} @click=${() => !disabled && (this.packageFormMode = "create")} ?inert=${!!importingName} ?data-disabled=${disabled} title=${disabled? "This is a feature for developers. It only works in Chromium-based browsers with the File System Access API enabled (Chrome, Edge, etc.).": ""}>
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
    const version = new SemVer(packageForm.value.version)
    version.prerelease = ["local"]
    const pkg = new Package({...packageForm.value, version}, packageForm.editingState)
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
    if(WEBWRITER_ENVIRONMENT.backend === "tauri") {
      await this.app.store.packages.add(`file://${pkg.localPath!}`, pkg.name)
    }
    else {
      await this.app.store.packages.add(packageForm.directoryHandle!, pkg.id)
    }
    if(packageForm.editingState.watching) {
      this.emitWatchWidget(pkg.id)
    } 
    this.packageForm.reset()
  }

  async handlePackageFormPickPath(e: CustomEvent) {
    if(WEBWRITER_ENVIRONMENT.backend === "tauri") {
      let localPath = await this.app.store.Dialog.promptRead({directory: true}) as string
      this.packageForm.localPath = localPath ?? this.packageForm.localPath
      this.handlePackageFormChangeField(new CustomEvent("ww-change-field", {detail: {name: "localPath", valid: true}}))
    }
    else {
      this.packageForm.directoryHandle = await (window as any).showDirectoryPicker({mode: "readwrite", startIn: "documents"})
      this.handlePackageFormChangeField(new CustomEvent("ww-change-field", {detail: {name: "localPath", valid: true}}))
      this.packageForm.localPath = this.packageForm.directoryHandle!.name
    }
  }

  async handlePackageFormChangeField(e: CustomEvent) {
    if(e.detail.name === "localPath" && this.packageFormMode === "edit" && e.detail.valid) {
      this.fillPackageFormWithLocal()
    }
    else if(e.detail.name === "localPath" && this.packageFormMode === "create" && e.detail.valid) {
      if(WEBWRITER_ENVIRONMENT.backend === "tauri") {
        const basename = await this.app.store.Path.basename(this.packageForm.localPath)
        const dirname = await this.app.store.Path.basename(await this.app.store.Path.dirname(this.packageForm.localPath))
        const possibleName = `@${dirname.replace("@", "")}/${basename}`
        this.packageForm.name = this.packageForm.name || possibleName
      }
      else {
        const possibleName = this.packageForm.directoryHandle!.name
        this.packageForm.name = this.packageForm.name || possibleName
      }
    }
  }

  async fillPackageFormWithLocal() {
    try {
      const pkgKeys = ["name", "license", "version", "author", "keywords"] as const
      let pkg: Package
      try {
        pkg = await this.app.store.packages.readLocal(WEBWRITER_ENVIRONMENT.backend === "tauri"? this.packageForm.localPath: this.packageForm.directoryHandle!)
      }
      catch(err) {
        console.error(err)
      }
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
    return html`<sl-dialog ?open=${!!this.errorPkg} @sl-after-hide=${() => this.errorPkg = undefined} label=${msg("Error with ") + (this.errorPkg?.id ?? "")}>
      ${issues.map(issue => html`
        <div class="error-pane">
          <b>${issue.message}</b>
          <pre class="error-location">${issue.stack}</pre>
          <pre class="error-content">${issue.cause}</pre>
        </div>
      `)}
      <i style="float: right; font-size: 0.75rem;">${msg("See developer tools for more details")}</i>
    </sl-dialog>`
  }

  PinPreview() {
    return html`<sl-card id="pin-preview" class=${classMap({"package-card": true})}>
      <span class="title">
        ${msg("New pin...")}
        <ww-button class="unpin" variant="icon" icon="pinned"></ww-button>
      </span>
      <sl-progress-bar></sl-progress-bar>
    </span>
	</sl-card>`
  }

  protected firstUpdated() {
    this.addEventListener("blur", e => {
      setTimeout(() => {
        if(this.app.activeEditor?.pmEditor.hasFocus()) {
          this.managing = false
        }
      })
    })
    this.app.addEventListener("keydown", e => {
      if(!e.composedPath().includes(this)) {
        this.managing = false
      }
    })
    this.app.addEventListener("mousedown", e => {
      if(!e.composedPath().includes(this)) {
        this.managing = false
      }
    })
  }

	render() {
    return html`
      ${this.PackageToolbar()}
      ${this.app.commands.groupedContainerCommands.map(this.Card)}
      ${this.ClipboardCard()}
      ${this.editingStatus != "pinning"? undefined: this.PinPreview()}
      ${this.packagesInSearchOrder.map(this.Card)}
      ${this.AddLocalPackageButton()}
      ${this.LocalPackageDialog()}
      ${this.ErrorDialog()}
    `
	}
}