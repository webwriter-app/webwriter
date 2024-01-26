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
import {ViewModelMixin} from "../viewmodel"
import { SlAlert } from "@shoelace-style/shoelace"
import { ifDefined } from "lit/directives/if-defined.js"
import { ExplorableEditor } from "./editor"


export interface SlAlertAttributes {
	message: string
	variant?: SlAlert["variant"]
	icon?: string
	duration?: number
}

@localized()
@customElement("ww-app")
export class App extends ViewModelMixin(LitElement)
{

  async connectedCallback() {
    super.connectedCallback()
    document.addEventListener("dragenter", (e: DragEvent) => {
      e.preventDefault()
    })
    document.addEventListener("dragover", (e: DragEvent) => {
      if(e.dataTransfer) {
        e.dataTransfer.dropEffect = "none"
      }
      e.preventDefault()
    })
    document.addEventListener("drop", (e: DragEvent) => {
      e.preventDefault()
    })
  }
	
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

      #header-right ww-button[data-active] {
        background: var(--sl-color-warning-200);
        color: var(--sl-color-warning-900);
        border-radius: var(--sl-border-radius-medium);
      }

      #preview-label {
        margin-right: 0.5ch;
      }

      #editHead {
        transition: cubic-bezier(0.23, 1, 0.320, 1) 0.75s;
      }

      :host([foldOpen]) #editHead {
        transform: rotate(90deg);
        color: var(--sl-color-primary-600);
      }

			@media only screen and (max-width: 1300px) {
				:host(:not(.noResources)) #settings-button .text {
					display: none;
				}
			}
		`
	}

  @property({type: Boolean, attribute: true, reflect: true})
	foldOpen: boolean = false

  @property({type: Boolean, attribute: true, reflect: true})
	sourceMode = false

	@query("ww-explorable-editor[data-active]")
	activeEditor: ExplorableEditor | null

	async notify({message, variant="primary"}: SlAlertAttributes) {
		const duration = 5000
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
    if(this.initializing) {
      return null
    }
		const {changed, set, setHead, url, editorState, codeState, ioState, provisionalTitle, inMemory} = this.store.document
		const {packagesList, bundleJS, bundleCSS, bundleID} = this.store.packages
		const {locale, showTextPlaceholder} = this.store.ui
		const {open} = this.environment.api.Shell
    const {documentCommands, commands: {setDocAttrs, editHead}} = this.commands
    const head = html`<ww-head 
      .documentCommands=${documentCommands.filter(cmd => cmd.id !== "editHead")}
      ioState=${ioState}
      slot="nav"
      filename=${inMemory && provisionalTitle? provisionalTitle: url}
      ?pendingChanges=${changed}
    >
      <ww-button variant="icon" ${spreadProps(editHead.toObject())} @click=${() => editHead.run()}></ww-button>
    </ww-head>`
    const metaeditor = this.store? html`<ww-metaeditor
      .app=${this}
      .editorState=${editorState}
      .head$=${(editorState as any).head$}
      .bodyAttrs=${editorState.doc.attrs}
      @ww-change-body-attrs=${(e: any) => setDocAttrs.run(e.target.bodyAttrs)}
      @ww-update=${(e: any) => setHead(e.detail.state)} @ww-click-tab=${(e: any) => this.foldOpen = true} slot="fold">

    </ww-metaeditor>`: null
    const editor = this.store? html`<ww-explorable-editor
    .app=${this}
    slot="main"
    docID=${url}
    data-active
    @focus=${() => this.foldOpen = false}
    .bundleJS=${bundleJS}
    .bundleCSS=${bundleCSS}
    bundleID=${bundleID}
    .editorState=${editorState}
    .codeState=${codeState}
    @update=${(e: any) => set(e.detail.editorState)}
    @ww-open=${(e: any) => open(e.detail.url)}
    .packages=${packagesList}
    ?loadingPackages=${false}
    .showTextPlaceholder=${showTextPlaceholder}
    ?controlsVisible=${!this.foldOpen}
    lang=${locale}>
  </ww-explorable-editor>`: null
	return [head, metaeditor, editor]
	}

  HeaderLeft = () => {
    if(this.initializing) {
      return null
    }
    const {appCommands} = this.commands
    return html`<div id="header-left" slot="header-left">
      ${appCommands.map(v => html`
        <ww-button variant="icon" ${spreadProps(v.toObject())} @click=${() => v.run()}></ww-button>
      `)}
    </div>`
  }

  HeaderRight = () => {
    if(this.initializing) {
      return null
    }
    const {queryCommands} = this.commands
    return html`<div id="header-right" slot="header-right">
      ${queryCommands({category: "editor", tags: ["general"]}).map(v => html`
        <ww-button variant="icon" ${spreadProps(v.toObject())} ?data-active=${v.active} @click=${() => v.run()} ?reverse=${v.id === "preview"}>${v.id === "preview"? html`<span id="preview-label">${v.label}</span>`: null}</ww-button>
      `)}
    </div>`
  }

	Notification() {
		const {dequeueNotification} = this.store.ui
		const nextNotification = dequeueNotification()
		nextNotification && this.notify(nextNotification).then(() => this.requestUpdate())
	}

	render() {
		if(!this.initializing) {
			this.Notification()
			this.localization.setLocale(this.store.ui.locale)
		}
		return html`<ww-layout 
			openTab
			activeTabName=${ifDefined(this.store?.document.url)}
      ?loading=${this.initializing}
      ?foldOpen=${this.foldOpen}>
        ${this.HeaderLeft()}
        ${this.HeaderRight()}
        ${this.Content()}
		</ww-layout><div style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 1000000; pointer-events: none;"></div>`
	}
}