import "@shoelace-style/shoelace/dist/themes/light.css"
// import "@shoelace-style/shoelace"
import appIconRaw from "../app-icon-transparent.svg?raw"
import {unsafeSVG} from 'lit/directives/unsafe-svg.js'
import {guard} from 'lit/directives/guard.js'
import { spreadProps } from "@open-wc/lit-helpers"

export * from "./configurator"
export * from "./editor"
export * from "./elements"
export * from "./layout"

import {LitElement, html, css} from "lit"
import {customElement, property, query} from "lit/decorators.js"
import { localized, msg } from "@lit/localize"

import { escapeHTML, groupBy } from "../utility"
import {CommandEvent, ViewModelMixin} from "../viewmodel"
import { SlAlert } from "@shoelace-style/shoelace"
import { ifDefined } from "lit/directives/if-defined.js"
import { ExplorableEditor } from "./editor"
import { classMap } from "lit/directives/class-map.js"


export interface SlAlertAttributes {
	message: string
	variant?: SlAlert["variant"]
	icon?: string
	duration?: number
}

/*
@TODO Fix interaction widget insert transition
@TODO Fix clipping on error for local package in palette
@TODO Fix setting hydration of `showWidgetPreview`
@TODO Fix local package loading
@TODO Fix unreliable package install behaviour (queueing issue?)
*/


@localized()
@customElement("ww-app")
export class App extends ViewModelMixin(LitElement)
{
	
	static get styles() {
		return css`
			:host {
				background: var(--sl-color-gray-100);
				overflow: hidden;
        display: block;
        height: 100vh;
        width: 100vw;
			}

			.save-button::part(base) {
				padding: 0;
				margin-right: 20px;
			}

			:host(.noResources) {
				background-color: white;
				transition: none;
			}

			#initializingPlaceholder {
				display: flex;
				justify-content: center;
				align-items: center;
				height: 100%;
        position: relative;
        background: white;
			}

			#initializingPlaceholder > div {
				text-align: center;
			}

			#initializingPlaceholder sl-spinner {
				margin-bottom: 0.5rem;
				font-size: 8rem;
				--track-width: 8px;
			}

      #initializingPlaceholder .app-icon, #initializingPlaceholder svg {
        width: 80px;
        height: 80px;
        position: absolute;
        top: calc(50% - 47px);
        left: calc(50% - 38px);
      }

			#settings-button {
				margin-top: 1px;
				height: 48px;
				margin-right: auto;
				user-select: none;
				display: flex;
				flex-direction: row;
				align-items: center;
				text-overflow: ellipsis;
				overflow: hidden;
				box-sizing: border-box;
        z-index: 101;
        --icon-size: 20px;
			}

			#settings-button > * {
				flex-shrink: 0;
			}

			:host(.noResources) #settings-button {
				grid-column: 1 / 4;
			}

			#settings-button:hover, #settings-button:hover *::part(base) {
				cursor: pointer;
				color: var(--sl-color-primary-600);
			}

			#settings-button:active, #settings-button:active *::part(base) {
				color: var(--sl-color-primary-800);
			}

			#settings-button .text {
				font-size: 0.8rem;
			}

			#settings-button:not(:hover):not(:active) .text {
				color: var(--sl-color-neutral-600);
			}

			ww-layout::part(drawer-left) {
				--size: clamp(600px, 50vw, 800px);
				--header-spacing: var(--sl-spacing-x-small);
			}

			ww-layout::part(drawer-left-title) {
				display: flex;
				flex-direction: row;
				align-items: center;
				gap: 1rem;
			}

			ww-layout::part(drawer-left-body) {
				padding: 0;
				height: 100%;
			}

			ww-layout::part(drawer-left-footer) {
				display: none;
			}

			ww-layout::part(drawer-left-header-actions) {
				align-items: center;
				gap: 2ch;
			}

      ww-layout.preview #header-left {
        display: none;
      }

      ww-layout.preview #header-right > :not(#preview) {
        display: none;
      }

      ww-layout:not(.preview) #preview-label {
        display: none;
      }

      ww-layout.preview #header-right #preview {
        z-index: 1000;
      }

      ww-layout.preview #header-right #preview.active {
        z-index: 1000;
      }

			.title-button::part(base) {
				height: var(--sl-input-height-small);
    		line-height: calc(var(--sl-input-height-small) - var(--sl-input-border-width) * 2);
			}

      #header-left, #header-right {
        display: flex;
        flex-direction: row;
        align-items: center;
        --icon-size: 20px;
        color: var(--sl-color-gray-700);
        padding-left: 1.5ch;
        padding-right: 1.5ch;
      }

      #header-right {
        justify-content: flex-end;
      }

      #preview-label {
        margin-right: 0.5ch;
      }

			@media only screen and (max-width: 1300px) {
				:host(:not(.noResources)) #settings-button .text {
					display: none;
				}
			}
		`
	}

  get markCommands() {
    return this.commands.queryCommands({tags: ["mark"]})
  }

  get blockCommands() {
    return this.commands.queryCommands({tags: ["block"]})
  }

  get groupedBlockCommands() {
    return groupBy(this.blockCommands, "group")
  }

  get generalCommands() {
    return this.commands.queryCommands({tags: ["general"]})
  }

  get containerCommands() {
    return this.commands.queryCommands({tags: ["container"]})
  }

  get priorityContainerCommands() {
    const commands = this.containerCommands
    const activeI = commands.findIndex(cmd => cmd.active)
    const activeCommand = commands[activeI]
    const activeCommandGroup = commands.filter(cmd => activeCommand?.group && activeCommand.group === cmd.group).map(cmd => cmd.id)
    const activeOffset = activeCommandGroup.indexOf(activeCommand?.id)
    const nextCmd = activeCommandGroup[(activeOffset + 1) % activeCommandGroup.length]
    const nextI = commands.findIndex(cmd => cmd.id === nextCmd)
    const priorityCommands = commands.filter((cmd, i) => {
      const primaryI = commands.findIndex(c => c.group === cmd.group)
      return !cmd.group || (activeI !== undefined && activeCommandGroup.includes(cmd.id)? nextI: primaryI) === i
    })
    return priorityCommands
  }

  get groupedContainerCommands() {
    return Object.values(groupBy(this.containerCommands, "group"))
  }

  get inlineCommands() {
    return this.commands.queryCommands({tags: ["inline"]})
  }

  get fontCommands() {
    return this.commands.queryCommands({tags: ["font"]})
  }

  get fontFamilyCommand() {
    return this.commands.queryCommands("fontFamily")[0]
  }

  get fontSizeCommand() {
    return this.commands.queryCommands("fontSize")[0]
  }

  get documentCommands() {
    return this.commands.queryCommands({category: "document"})
  }

	@property({attribute: false})
	settingsOpen: boolean = false

	@query("ww-explorable-editor[data-active]")
	activeEditor: ExplorableEditor | null

	async notify({message, variant="primary"}: SlAlertAttributes) {
		const duration = 2500
		const icon = {
			"primary": "info-circle",
			"success": "circle-check",
			"neutral": "help-circle",
			"warning": "alert-circle",
			"danger": "circle-x"
		}[variant]
		const alert = Object.assign(document.createElement("sl-alert"), {
			variant,
			closable: true,
			duration,
			innerHTML: `
				<sl-icon name="${icon}" slot="icon"></sl-icon>
				${typeof message  === "string"? escapeHTML(message): JSON.stringify(message)}
			`
		})
		this.appendChild(alert)
		return alert.toast()
	}


	Content = () => {
		const {active, previewing, changed, set, create} = this.store.resources
		const {packages, availableWidgetTypes, bundleCode, bundleCSS, bundleID} = this.store.packages
		const {locale, showTextPlaceholder, showWidgetPreview} = this.store.ui
		const {open} = this.environment.api.Shell
    const head = html`<ww-head 
      slot="nav"
      filename=${ifDefined(active?.url)}
      ?pendingChanges=${Boolean(changed[active?.url as any])}
      .resourceCommands=${this.documentCommands as any}
    >
    </ww-head>`
    const editor = this.store && active? html`<ww-explorable-editor
    slot="main"
    docID=${active.url}
    .markCommands=${this.markCommands as any}
    .containerCommands=${this.containerCommands as any}
    .priorityContainerCommands=${this.priorityContainerCommands as any}
    .groupedContainerCommands=${this.groupedContainerCommands as any}
    .inlineCommands=${this.inlineCommands as any}
    .blockCommands=${this.blockCommands as any}
    .fontFamilyCommand=${this.fontFamilyCommand as any}
    .fontSizeCommand=${this.fontSizeCommand as any}
    .bundleCode=${bundleCode}
    .bundleCSS=${bundleCSS}
    bundleID=${bundleID}
    .editorState=${active.editorState}
    @update=${(e: any) => set(active.url, e.detail.editorState)}
    @ww-open=${(e: any) => open(e.detail.url)}
    .availableWidgetTypes=${availableWidgetTypes}
    .packages=${packages}
    ?loadingPackages=${false}
    ?previewing=${previewing[active.url]}
    .showTextPlaceholder=${showTextPlaceholder}
    .showWidgetPreview=${showWidgetPreview}
    ?data-active=${active.url === active?.url}
    lang=${locale}>
  </ww-explorable-editor>`: null
	return !active? head: [head, editor]
	}

	Placeholder = () => {
    return html`<div id="initializingPlaceholder" slot="main">
		<div>
			<sl-spinner></sl-spinner>
      <div class="app-icon">
        ${unsafeSVG(appIconRaw)}
      </div>
			<div>${msg("Loading WebWriter...")}</div>
		</div>
	</div>`
  }

	PackageManager = () => {
		const {packages, adding, removing, upgrading, fetching, resetting, add, remove, upgrade, fetchAll, viewAppDir, resetAppDir, addLocal, watching, openMain} = this.store.packages
		const {setAndPersist} = this.settings

		return html`<ww-package-manager
			slot="pre-tab-panel-a"
      .store=${this.store}
			.packages=${packages}
			.adding=${adding}
			.removing=${removing}
			.upgrading=${upgrading}
			?loading=${fetching}
			?resetting=${resetting}
			@ww-add-package=${(e: any) => add(e.detail.args)}
			@ww-remove-package=${(e: any) => remove(e.detail.args)}
			@ww-upgrade-package=${(e: any) => upgrade(e.detail.args)}
      @ww-edit-package=${(e: any) => e} 
      @ww-open-package-code=${(e: any) => openMain(e.detail.name)} 
			@ww-toggle-watch=${(e: any) => setAndPersist("packages", "watching", {...watching, [e.detail.name]: !watching[e.detail.name]})}
			@ww-refresh=${() => fetchAll(0)}
			@ww-open-app-dir=${() => viewAppDir()}></ww-package-manager>
		</ww-package-manager>`
	}

	KeymapManager = () => {
		const {commandMap, groupLabels, reassignShortcut} = this.commands
		const {setAndPersist} = this.settings
		return html`<ww-keymap-manager
			slot="post-tab-panel-a"
			.keymap=${commandMap}
			.groupLabels=${groupLabels}
			@ww-shortcut-change=${(e: CustomEvent) => {
				const {name, shortcut} = e.detail
				const customKeymap = this.store.get("ui", "keymap")
        const oldShortcut = customKeymap[name]?.shortcut ?? commandMap[name].shortcut
				setAndPersist("ui", "keymap", {...customKeymap, [name]: {shortcut}})
        reassignShortcut(name, oldShortcut)
			}}
			@ww-shortcut-reset=${(e: CustomEvent) => {
				const {name} = e.detail
				const customKeymap = {...this.store.get("ui", "keymap")}
        const oldShortcut = customKeymap[name]?.shortcut ?? commandMap[name].shortcut
        delete customKeymap[name]
				setAndPersist("ui", "keymap", customKeymap)
        reassignShortcut(name, oldShortcut)
			}}
		></ww-keymap-manager>`
	}

  HeaderLeft = () => {
    const {queryCommands} = this.commands
    return html`<div id="header-left" slot="header-left" class=${classMap({})}>
      ${queryCommands({category: "app"}).map(v => html`
        <ww-button variant="icon" ${spreadProps(v)} @click=${() => this.dispatchEvent(CommandEvent(v.id))}></ww-button>
      `)}
    </div>`
  }

  HeaderRight = () => {
    const {queryCommands} = this.commands
    return html`<div id="header-right" slot="header-right">
      ${queryCommands({category: "editor", tags: ["general"]}).map(v => html`
        <ww-button variant="icon" ${spreadProps(v)} @click=${() => this.dispatchEvent(CommandEvent(v.id))} ?reverse=${v.id === "preview"}>${v.id === "preview"? html`<span id="preview-label">${v.label}</span>`: null}</ww-button>
      `)}
    </div>`
  }

	Settings = () => {
		const {specs, values, specLabels, setAndPersist} = this.settings
		const {fetchAll, viewAppDir, resetAppDir} = this.store.packages
		return html`
      <span slot="drawer-left-label">${msg("Settings")}</span>
			<ww-button size="small" slot="drawer-left-header-actions" variant="danger" outline class="title-button" @click=${() => {resetAppDir(); this.settingsOpen = false}} confirm>
				<span>${msg("Reset WebWriter")}</span>
				<span slot="confirm">${msg("Are you sure? This action can't be reversed, all your settings will be deleted and reset.")}</span>
			</ww-button>
			<ww-button size="small" slot="drawer-left-header-actions" variant="neutral" outline class="title-button" @click=${() => viewAppDir()}>
				<span>${msg("View App Folder")}</span>
			</ww-button>
			<ww-configurator
				slot="drawer-left-body"
				.specs=${specs}
				.specLabels=${specLabels}
				.values=${values}
				@ww-change=${(e: any) => setAndPersist(e.detail.groupKey, e.detail.key, e.detail.value)}
			>
				<span slot="pre-tab-a">
					<span>${msg("Packages")}</span>
				</span>
				${this.PackageManager()}
				<span slot="post-tab-a">
					<span>${msg("Shortcuts")}</span>
				</span>
				${this.KeymapManager()}
			</ww-configurator>
		`
	}

	Notification() {
		const {dequeueNotification} = this.store.ui
		const nextNotification = dequeueNotification()
		nextNotification && this.notify(nextNotification).then(() => this.requestUpdate())
	}

	render() {
		const initializing = !this.store || this.store.packages.initializing
    const previewing = this?.store?.resources?.previewing ?? {}
    const active = this?.store?.resources?.active
    const preview = previewing[active?.url ?? ""]
    const classes = {preview}
		if(!initializing) {
			this.Notification()
			this.localization.setLocale(this.store.ui.locale)
		}
		return html`<ww-layout 
			openTab
      class=${classMap(classes)}
			activeTabName=${ifDefined(this.store?.resources.active?.url)}
			?drawerLeftOpen=${this.settingsOpen}
			?hideAsides=${this.store?.resources.empty}
      ?loading=${initializing}
			@ww-add-tab=${() => this.store.resources.create()}
      @ww-print-tab=${() => this.commands.dispatch("print")}
			@ww-open-tab=${() => this.store.resources.load()}
			@ww-show-drawer=${() => {this.settingsOpen = true; this.store.packages.fetchAll()}}
			@ww-hide-drawer=${() => this.settingsOpen = false}>
      ${initializing? this.Placeholder(): [
        this.HeaderLeft(),
        this.HeaderRight(),
        this.Content(),
        this.settingsOpen? this.Settings(): null
      ]}
		</ww-layout>`
	}
}