import { localized, msg } from "@lit/localize"
import { LitElement, PropertyValues, css, html, noChange } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import { classMap } from "lit/directives/class-map.js"
import { ifDefined } from "lit/directives/if-defined.js"
import { EditorState } from "prosemirror-state"
import {Directive, PartInfo, directive, ElementPart} from "lit/directive.js"
import { SlInput, SlPopup, SlProgressBar } from "@shoelace-style/shoelace"

import { Locale, MemberSettings, Package, SemVer } from "#model"
import { prettifyPackageName, filterObject } from "#utility"
import { Command, SettingsController } from "#viewmodel"
import { App, PackageForm } from "#view"
import { spreadProps } from "@open-wc/lit-helpers"

import IconPackage from "@tabler/icons/outline/package.svg"
import { styleMap } from "lit/directives/style-map.js"
import { guard } from "lit/directives/guard.js"
import { cache } from "lit/directives/cache.js"
import styles from "./index.style"

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

@localized()
@customElement("ww-palette")
export class Palette extends LitElement {

  @property({attribute: false})
  app: App

  @property({attribute: false})
  loading = false

  @property({attribute: false})
  packageIcons = {}

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

  @property({attribute: false})
  changingID = ""

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

  @property({type: Boolean})
	forceToolboxPopup: boolean = false

  @property({type: Boolean, attribute: true, reflect: true})
  managing = false

  @property({type: Boolean, attribute: true, reflect: true})
  isInNarrowLayout = false

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

	static styles = styles

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
    const order = Object.keys(this.searchResults).indexOf(id) + 1 || 1000000
    const iconUrl = packages.packageIcons[id]
    const adding = !!packages.adding[id]
    const removing = !!packages.removing[id]
    const updating = !!packages.updating[id]
    const changing = adding || removing || updating
    const found = id in this.searchResults
    const error = packages.getPackageIssues(pkg.id).length
    const members = packages.getPackageMembers(pkg.id)
    const insertables = members? Object.values(filterObject(members, (_, ms) => !(ms as any).uninsertable && !ms.name.startsWith("./tests/")) as unknown as Record<string, MemberSettings>): []
    const pkgEditingSettings = !packageEditingSettings? undefined: {name: undefined, label: undefined, ...packageEditingSettings}
    const {name: firstName, label: firstLabel} =  (pkgEditingSettings?.label? pkgEditingSettings: undefined) ?? insertables[0] ?? {}
    const otherInsertables = insertables.slice(1)

    const cardLabel = html`
      <span class="title" @click=${() => this.handleClickCard(pkg, firstName)}>
        <img class="package-icon" src=${iconUrl? iconUrl: IconPackage}>
        ${firstLabel?._ ?? prettifyPackageName(pkg.name)}
      </span>
      <span slot="content">
        ${this.PackageDescription(pkg, !!error)}
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
            ${v.label?.[this.app.store.ui.locale] ?? v.label!._}
          </sl-menu-item>`)}
        </sl-menu>
      </sl-popup>
    `
    return html`<sl-card id=${pkg.id} @contextmenu=${(e: any) => {this.contextPkg = pkg; e.preventDefault()}} data-package-name=${name} @mouseenter=${() => this.handleMouseenterInsertable(pkg)} @mouseleave=${() => this.handleMouseleaveInsertable(pkg)} class=${classMap({"package-card": true, "block-card": true, installed: !!installed, error, adding, removing, updating, outdated, watching: !!watching, found, local: !!localPath, multiple: insertables.length > 1})} style=${styleMap({order})} ?inert=${changing}>
		<sl-tooltip placement="top" class="package-tooltip" hoist trigger=${this.testMode? "manual": "hover"}>
      ${cardLabel}
		</sl-tooltip>
		<sl-progress-bar ?indeterminate=${changing}></sl-progress-bar>
	</sl-card>`
  }

  SemanticMarkCard = () => {
    const cmds = this.app.commands.semanticMarkCommands
    if(!cmds.length) {
      return null
    }
    const cmd = cmds[0]
    return html`<sl-card id="semantic-mark-card" class=${classMap({"package-card": true, "container-card": true, "multiple": cmds.length > 1})} ?inert=${cmd.disabled} @click=${() => this.handleClickCard(cmd)} @mouseenter=${() => this.handleMouseenterInsertable(cmd)} @mouseleave=${() => this.handleMouseleaveInsertable(cmd)}>
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
              <sl-checkbox size="small"></sl-checkbox>
              <sl-icon class="container-icon" name=${c.icon ?? "square"}></sl-icon>
              ${c.label}
            </sl-menu-item>`)}
          </sl-menu>
        </sl-popup>
        <sl-progress-bar></sl-progress-bar>
    </sl-card>`
  }

  @property({type: String})
  editingID: string

  focusSnippetTitle(id?: string) {
    const selector = !id? ".snippet-card sl-input": `#${id} sl-input`
    return (this.shadowRoot?.querySelector(selector) as any)?.focus()
  }

  SnippetCard = (pkg: Package & {_: {html: string}}) => {
    const {name, editingConfig, _: {html: snippetHtml}} = pkg
    const label = (editingConfig ?? {})["."]?.label?._ ?? prettifyPackageName(name)
    return html`<sl-card id=${pkg.id} class=${classMap({"package-card": true, "snippet-card": true})}>
      <span @click=${() => this.handleClickCard(pkg)} class="title" @mouseenter=${() => this.handleMouseenterInsertable(pkg)} @mouseleave=${() => this.handleMouseleaveInsertable(pkg)}>
        ${this.managing
          ? html`<sl-input style=${`width: ${label.length}ch`} class="snippet-label" size="small" type="text" value=${label} @focusin=${(e: any) => {e.preventDefault(); e.stopPropagation()}} @click=${(e: any) => {e.preventDefault(); e.stopPropagation()}} @sl-change=${(e: any) => {this.app.store.packages.putSnippet(name, {id: parseInt(name.split("-").at(-1)!), html: snippetHtml, label: {_: e.target.value}}); this.blur()}}></sl-input>`
          : html`<span class="snippet-label">${label}</span>`
        }
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
      return this.SnippetCard(cmdOrPkg as any)
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

  @query("#package-search")
  packageSearch: SlInput

  get searchPlaceholder() {
    if(!this.app.store.packages.installed.length || !this.packageSearch?.value && this.packageSearch?.matches(":focus-within")) {
      return msg("Find packages...")
    }
    else {
      return ""
    }
  }

  PackageToolbar() {
    return html`<div id="package-toolbar" >
      <sl-input id="package-search" autocomplete="off" placeholder=${this.searchPlaceholder} required type="search" size="small" @sl-input=${this.handleSearchInput} @focus=${() => this.managing = true} clearable>
        <sl-icon slot="prefix" name="search" @click=${(e: any) => this.packageSearch.focus()}></sl-icon>
        <!--<ww-button id="filter-button" variant="icon" slot="suffix" icon="filter" @click=${(e: any) => this.packageSearch.focus()}></ww-button>-->
      </sl-input>
      <sl-popup id="filters-popup" anchor="package-search">
        ${this.SearchFilters()}
      </sl-popup>
      <ww-button title=${msg("Reload packages")} .issues=${this.app.store.packages.managementIssues} id="package-button" variant="icon" icon="packages" @click=${(e: any) => {this.managing = !this.managing; this.managing && this.app.store.packages.load()}}>
        ${!this.app.store.packages.loading? null: html`
          <sl-spinner id="packages-spinner"></sl-spinner>
        `}
      </ww-button>
    </div>`
  }

  private get programmeLabels() {
    return {
      "0": msg("Preschool") ,
      "1": msg("Primary school"),
      "2": msg("Middle school"),
      "3": msg("High school"),
      "4": msg("Vocational cert."),
      "5": msg("Associate deg."),
      "6": msg("Bachelor's"),
      "7": msg("Master's"),
      "8": msg("Doctorate"),
      "9": msg("Misc. ed."),
      "2-4": msg("Secondary ed."),
      "5-8": msg("Higher ed."),
    }
  }

  private get programmeIcons() {
    return {
      "0": "horse-toy",
      "1": "backpack",
      "2": "backpack",
      "3": "backpack",
      "4": "backpack",
      "5": "school",
      "6": "school",
      "7": "school",
      "8": "school",
      "9": "book-2",
      "2-4": "backpack",
      "5-8": "school",
    }
  }

  private get fieldLabels() {
    return {
      "01": msg("Education"),
      "02": msg("Humanities"),
      "03": msg("Social sciences"),
      "04": msg("Business"),
      "05": msg("Natural sciences"),
      "06": msg("ICT"),
      "07": msg("Engineering"),
      "08": msg("Food production"),
      "09": msg("Health"),
      "10": msg("Services"),
      "99": msg("Other fields"),
      "all": msg("All fields")
    }
  }

  private get fieldIcons() {
    return {
      "01": "chalkboard",
      "02": "brush",
      "03": "news",
      "04": "briefcase",
      "05": "microscope",
      "06": "cpu",
      "07": "tool",
      "08": "tractor",
      "09": "heartbeat",
      "10": "building-store",
      "99": "book",
      "all": "books"
    }
  }

  private get widgetTypeLabels() {
    return {
      "presentational": msg("Presentation"),
      "practical": msg("Practice"),
      "simulational": msg("Simulation"),
      "conceptual": msg("Concept"),
      "informational": msg("Information"),
      "contextual": msg("Context")
    }
  }

  private get widgetTypeIcons() {
    return {
      "presentational": "alert-square",
      "practical": "help-square",
      "simulational": "square-chevron-right",
      "conceptual": "square-dot",
      "informational": "info-square",
      "contextual": "square-asterisk"
    }
  }

  PackageKeyword(kw: string) {
    return html`<span class="package-keyword">${kw}</span>`
  }

  ProgrammeTag(code?: keyof Palette["programmeLabels"]) {
    return !code? undefined: html`
      <span class="package-keyword package-programme">
        <sl-icon name=${this.programmeIcons[code]}></sl-icon>
        <span>${this.programmeLabels[code]}</span>
      </span>
    `
  }

  PackageProgramme(pkg: Package) {
    if(!pkg.minProgramme || !pkg.maxProgramme) {
      return undefined
    }
    else {
      return [
        this.ProgrammeTag(pkg.programmes.find(pg => pg.level === "0")?.level),
        this.ProgrammeTag(pkg.programmes.find(pg => pg.level === "1")?.level),
        ...(pkg.coversSecondaryEducation? [this.ProgrammeTag("2-4")]: [
          this.ProgrammeTag(pkg.programmes.find(pg => pg.level === "2")?.level),
          this.ProgrammeTag(pkg.programmes.find(pg => pg.level === "3")?.level),
          this.ProgrammeTag(pkg.programmes.find(pg => pg.level === "4")?.level)
        ]),
        ...(pkg.coversHigherEducation? [this.ProgrammeTag("5-8")]: [
          this.ProgrammeTag(pkg.programmes.find(pg => pg.level === "5")?.level),
          this.ProgrammeTag(pkg.programmes.find(pg => pg.level === "6")?.level),
          this.ProgrammeTag(pkg.programmes.find(pg => pg.level === "7")?.level),
          this.ProgrammeTag(pkg.programmes.find(pg => pg.level === "8")?.level),
        ]),
      ]
    }
  }

  PackageOnlineStatus(pkg: Package) {
    let label = ""
    if(pkg.widgetOnlineStatus === "always") {
      label = msg("Online only")
    }
    else if(pkg.widgetOnlineStatus === "edit") {
      label = msg("Online when editing")
    }
    else if(pkg.widgetOnlineStatus === "use") {
      label = msg("Online when using")
    }
    else {
      return undefined
    }
    return html`<span class="package-keyword package-online-status">
      <sl-icon name="wifi"></sl-icon>
      ${label}
    </span>`
  }

  PackageFields(pkg: Package) {
    const includesAllFields = (["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"] as const).every(code => pkg.broadFieldCodes.includes(code))
    const codes = includesAllFields? ["all"] as const: pkg.broadFieldCodes
    return codes.map(code => html`
      <span class="package-keyword package-field">
        <sl-icon name=${this.fieldIcons[code]}></sl-icon>
        <span>${this.fieldLabels[code]}</span>
      </span>
    `)
  }

  PackageLocales(pkg: Package) {
    if(!pkg.locales.length) {
      return undefined
    }
    const userLangs = [...new Set(navigator.languages.map(lang => new Locale(lang).language)), this.app.store.ui.locale, this.app.store.document.lang]
    const relevantLocales = pkg.locales.filter(locale => userLangs.some(lang => locale.language.startsWith(lang.split("-").at(0)!)))
    const otherLocales = pkg.locales.filter(locale => !userLangs.includes(locale.language))
    return html`<span class="package-keyword package-locale">
      <sl-icon name="language"></sl-icon>
      ${relevantLocales.map(locale => (SettingsController.languageOptions as any)[locale.language]?.label).join(", ")}
      ${otherLocales.length? html`<sup>+${otherLocales.length}</sup>`: undefined}
    </span>`
  }

  PackageAITested(pkg: Package) {
    const tested = pkg.keywords?.includes("ww-ai-tested")
    if(!tested) {
      return undefined
    }

    return html`<span class="package-keyword package-ww-ai-tested">
      <sl-icon name="robot"></sl-icon>
      <span>${msg("WebWriter AI Kompartibel")}</span>
    </span>`
  }

  PackageWidgetTypes(pkg: Package) {
    return pkg.widgetTypes?.map(type => {
      return html`<span class="package-keyword package-widget-type">
        <sl-icon name=${this.widgetTypeIcons[type]}></sl-icon>
        <span>${this.widgetTypeLabels[type]}</span>
      </span>`
    })
  }

  PackageDescription(pkg: Package, error=false) {
    const {name, version} = pkg
    const v = new SemVer(String(version))
    const description = (pkg?.editingConfig as any)?.["."]?.description?.[this.app.store.ui.locale] ?? pkg.description
    v.prerelease = v.prerelease.filter(part => part !== "local")
    return html`
      <b class="package-title"><code>${name} ${v}</code></b>
      <div class="package-description">${description || (error? "- " + msg("Error reading this package") + " -": null) || msg("No description provided")}</div>
      <div class="package-keywords">
        ${this.PackageWidgetTypes(pkg)}
        ${this.PackageLocales(pkg)}
        ${this.PackageFields(pkg)}
        ${this.PackageOnlineStatus(pkg)}
        ${this.PackageProgramme(pkg)}
        ${this.PackageAITested(pkg)}
        ${pkg.nonstandardKeywords?.map(kw => this.PackageKeyword(kw))}
      </div>
    `
  }

  SearchFilters() { // online, language, type, programme, field
    return html`
      <sl-button-group>
        <sl-button size="small">
          <sl-icon></sl-icon>
        </sl-button>
      </sl-button-group>
    `
  }

  AddLocalPackageButton() {
    const importingName = undefined
    const disabled = !this.app.store.accounts.getClient("file", "file")?.showOpenFilePickerSupported
    return html`<sl-card id="add-local" class=${classMap({"package-card": true})} @click=${() => !disabled && (this.packageFormMode = "create")} ?inert=${!!importingName} ?data-disabled=${disabled} title=${disabled? "This is a feature for developers. It only works in Chromium-based browsers with the File System Access API enabled (Chrome, Edge, etc.).": ""}>
      <sl-icon name="plus"></sl-icon>
      <div>${importingName ?? msg(" Create/import")}</div>
      <sl-progress-bar ?indeterminate=${!!importingName}></sl-progress-bar>
    </span>
	</sl-card>`
  }

  ClipboardCard() {
    return html`<sl-card id="clipboard-card" class=${classMap({"package-card": true})} @click=${() => this.emitInsert("@webwriter/core", "clipboard")}>
      <sl-icon name="clipboard"></sl-icon>
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
    const unlocalVersion = new SemVer(pkg.version)
    unlocalVersion.prerelease = unlocalVersion.prerelease.filter(v => v !== "local")
    await this.app.store.packages.writeLocal(packageForm.directoryHandle!, pkg.extend({version: unlocalVersion}), options)
    this.packageForm.reset()
    // let directoryHandle = packageForm.directoryHandle
    // await this.app.store.packages.add(directoryHandle!, pkg.id)
    if(packageForm.editingState.watching) {
      this.emitWatchWidget(pkg.id)
    } 
    this.packageForm.reset()
  }

  async handlePackageFormPickPath(e: CustomEvent) {
    this.packageForm.directoryHandle = await (window as any).showDirectoryPicker({mode: "readwrite", startIn: "documents"})
    this.handlePackageFormChangeField(new CustomEvent("ww-change-field", {detail: {name: "localPath", valid: true}}))
    this.packageForm.localPath = this.packageForm.directoryHandle!.name
  }

  async handlePackageFormChangeField(e: CustomEvent) {
    if(e.detail.name === "localPath" && this.packageFormMode === "edit" && e.detail.valid) {
      this.fillPackageFormWithLocal()
    }
    else if(e.detail.name === "localPath" && this.packageFormMode === "create" && e.detail.valid) {
      const possibleName = this.packageForm.directoryHandle!.name
      this.packageForm.name = this.packageForm.name || possibleName
    }
  }

  async fillPackageFormWithLocal() {
    try {
      const pkgKeys = ["name", "license", "version", "author", "keywords"] as const
      let pkg: Package
      try {
        pkg = await this.app.store.packages.readLocal(this.packageForm.directoryHandle!)
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

  ToolboxToggle() {
    const [cmd] = this.app.commands.queryCommands("toggleToolbox")
    return html`<ww-button variant="icon" ${spreadProps(cmd.toObject())} @click=${() => cmd.run()} ?data-active=${cmd.active}></ww-button>`
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
    this.app.activeEditor!.requestUpdate()
  }

  protected updated(changed: PropertyValues) {
    if(changed.has("packages")) {
      const prevIds = changed.get("packages")?.map((pkg: Package) => pkg.id + (pkg.installed? "!installed": "")) ?? []
      const ids = this.app.store.packages.packagesList.map(pkg => pkg.id + (pkg.installed? "!installed": ""))
      const isAdd = ids.filter(id => id.endsWith("!installed")).length > prevIds.filter((id: string) => id.endsWith("!installed")).length
      const firstChangedId = ids.find((id, i) => prevIds[i] !== id)?.split("!")[0]
      if(firstChangedId && isAdd) {
        const el = this.shadowRoot!.querySelector("#" + CSS.escape(firstChangedId))! as HTMLElement
        el?.scrollIntoView({behavior: "smooth", block: "center", inline: "center"})
        return
        const elTop = el.getBoundingClientRect().top
        const elLeft = el.getBoundingClientRect().left
        const heightOffset = this.shadowRoot!.getElementById("package-toolbar")!.getBoundingClientRect().height
        let top = elTop + heightOffset
        const widthOffset = this.shadowRoot!.getElementById("package-toolbar")!.getBoundingClientRect().width
        let left = el.getBoundingClientRect().left + widthOffset
        console.log({elTop, elLeft, top, left})
        this.scrollTo({left, top, behavior: "smooth"})
      }
    }
  }

	render() {
    return html`
      ${this.PackageToolbar()}
      ${this.ToolboxToggle()}
      ${this.app.commands.groupedContainerCommands.map(this.Card)}
      ${this.ClipboardCard()}
      ${this.SemanticMarkCard()}
      ${this.editingStatus != "pinning"? undefined: this.PinPreview()}
      ${guard([...this.app.store.packages.filteredPackages, this.app.store.packages.changingID, this.dropdownOpen, this.searchResults, this.app.store.ui.locale, this.app.store.document.lang, this.managing], () => this.app.store.packages.filteredPackages.map(this.Card))}
      ${this.AddLocalPackageButton()}
      ${this.LocalPackageDialog()}
      ${this.ErrorDialog()}
    `
	}
}