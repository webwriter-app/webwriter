import { msg } from "@lit/localize"
import { LitElement, css, html } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import { classMap } from "lit/directives/class-map.js"
import { EditorState, Command } from "prosemirror-state"

import { Package, PackageWithOptions } from "../../model"
import { unscopePackageName, prettifyPackageName, camelCaseToSpacedCase } from "../../utility"
import { SlProgressBar } from "@shoelace-style/shoelace"
import { CommandEntry } from "../../viewmodel"

@customElement("ww-palette")
export class Palette extends LitElement {

	emitChangeWidget = (name: string) => {
		this.dispatchEvent(new CustomEvent("ww-change-widget", {composed: true, bubbles: true, detail: {name: unscopePackageName(name)}}))
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
  activeElement: Element | null

	@property({state: true})
	addingWidget: string | null

	@property({type: Number, attribute: false})
	widgetAddProgress: number = 0

	@property({type: Boolean})
	showWidgetPreview: boolean

	widgetAddInterval: any
	
	@query(".package-card:hover sl-progress-bar")
	activeProgressBar: SlProgressBar

	static styles = css`

		:host {
			z-index: 100;
			padding: 0 10px;
		}

		.package-card {
			position: relative;
			--padding: 10px;
		}

		.package-card::part(base) {
			position: relative;
			width: 175px;
			height: 30px;
			display: inline-block;
		}

		.package-card::part(body) {
			padding: 5px;
			height: 100%;
			overflow-y: hidden;
		}

		.title {
			display: flex;
			flex-direction: row;
			align-items: center;
			gap: 1ch;
			font-size: 0.9rem;
      		height: 2ch;
			user-select: none;
		}

		.package-card:not(.error) .title:hover {
			color: var(--sl-color-primary-600);
			cursor: pointer;
		}

		.package-card.error .title {
			color: var(--sl-color-danger-600);
			cursor: help;
		}

		.package-card.error sl-tooltip {
			--max-width: 500px;
		}

		.package-card.error .error-content {
			font-family: var(--sl-font-mono);
		}

		.package-card sl-progress-bar {
			width: 100%;
			--height: 2px;
			position: absolute;
			bottom: 0;
			left: 0;
		}

		.add-icon {
			margin-left: auto;
		}

		.title:not(:hover) .add-icon, .title.error .add-icon {
			visibility: hidden;
		}

		.close-button {
			position: absolute;
			top: 0;
			right: 0;
		}

		.info-icon {
			color: darkgray;
      		z-index: 10;
		}

		.info-icon:hover {
		  color: var(--sl-color-primary-600);
		}

		.alert-widget-creation::part(base) {
			z-index: 100;
			border: none;
		}

		.alert-widget-creation::part(icon) {
			font-size: 2rem;
			margin-right: 1ch;
		}

		.alert-widget-creation::part(message) {
			padding: 4px;
			height: 110px;
			display: flex;
			flex-direction: column;
			justify-content: center;
		}

		[part=widget-choices]::-webkit-scrollbar {
				width: 8px;
				height: 8px;
				overflow: auto;
			}

		[part=widget-choices]::-webkit-scrollbar-thumb {
			background: #a8a8a8;
		}

		[part=widget-choices]::-webkit-scrollbar-button {
			background: #505050;
			width: 4px;
		}

    .package-card[inert]::part(base) {
      background-color: transparent;
      box-shadow: none;
      border-color: var(--sl-color-gray-300);
    }

    .package-card[inert] sl-progress-bar {
      visibility: hidden;
    }

    .package-card[inert] .title {
      color: var(--sl-color-gray-400);
    }

		.package-tooltip {
			--show-delay: 750;
			--max-width: 200px;
		}

		.package-tooltip::part(base__arrow) {
			color: var(--sl-color-gray-950);
			background: var(--sl-color-gray-950);
		}

		.package-tooltip::part(body) {
			background: rgba(241, 241, 241, 0.95);
			border: 2px solid var(--sl-color-gray-400);
			color: var(--sl-color-gray-950);
		}
		
		@media only screen and (max-width: 1300px) {
			:host {
				display: flex;
				flex-direction: row;
				align-items: center;
				background: #f1f1f1;
				height: 50px;
				border-top: 1px solid lightgray;
				border-right: 1px solid lightgray;
				box-shadow: 0 -1px 2px hsl(240 3.8% 46.1% / 12%);;
				transform: translateX(0);
				box-sizing: border-box;
				gap: 0.5rem;
				padding-right: 0;
			}

			[part=widget-choices] {
				display: flex;
				flex-direction: row;
				flex: 6 0 250px;
				gap: 5px;
				overflow-x: auto;
				overflow-y: hidden;
				scrollbar-width: thin;
				height: 100%;
				padding-top: 5px;
				box-sizing: border-box;
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
	`

	private handleClickWidget(pkg: PackageWithOptions) {
		if(!pkg.importError) {
			this.addingWidget = pkg.name
			this.widgetAddProgress = 100
			clearInterval(this.widgetAddInterval)
			this.emitChangeWidget(pkg.name)
		}
	}

	static FormattedError(pkg: PackageWithOptions) {
		let err = pkg.importError
			?.replaceAll("X [ERROR] ", "")
			?.replaceAll(/\n\d* error(s)?/g, "")
			.trim()
		return err
	}

	handleMouseInWidgetAdd = (pkg: PackageWithOptions) => {
		if(!pkg.importError && this.showWidgetPreview) {
			this.addingWidget = pkg.name
			this.widgetAddInterval = setInterval(async () => {
				this.widgetAddProgress = Math.min(150, this.widgetAddProgress + 15)
				if(this.widgetAddProgress === 150) {
					clearInterval(this.widgetAddInterval)
					this.emitMouseInWidgetAdd(unscopePackageName(pkg.name))
				}
			}, 50)
		}
	}

	handleMouseOutWidgetAdd = (name: string) => {
		this.widgetAddProgress = 0
		this.addingWidget = null
		clearInterval(this.widgetAddInterval)
		this.emitMouseOutWidgetAdd(name)
	}

	Package = (pkg: PackageWithOptions) => html`<sl-card class=${classMap({error: !!pkg.importError, "package-card": true})} ?inert=${false}>
		<sl-tooltip placement="left-start" class="package-tooltip" hoist trigger="hover">
			<span title=${!pkg.importError? msg("Add this widget"): ""} @click=${() => this.handleClickWidget(pkg)} class="title" @mouseenter=${() => this.handleMouseInWidgetAdd(pkg)} @mouseleave=${() => this.handleMouseOutWidgetAdd(unscopePackageName(pkg.name))}>
				${!pkg.watching? null: html`
					<sl-icon title=${msg("Watching files")} name="lightning-charge-fill"></sl-icon>
				`}
				<span>
					${prettifyPackageName(pkg.name)}
				</span>
				<sl-icon class="add-icon" name="plus-square"></sl-icon>
			</span>
			${pkg?.importError
				? html`
					<pre class="error-content" slot="content">
						${Palette.FormattedError(pkg)}
					</pre>
				`: html`
					<span slot="content">
            <b><code>${pkg.name} ${pkg.version}</code></b>
						<div>${pkg.description || msg("No description provided")}</div>
					</span>
				`}
		</sl-tooltip>
		<sl-progress-bar value=${pkg.name === this.addingWidget? this.widgetAddProgress: 0}></sl-progress-bar>
	</sl-card>`

	render() {
    return html`
      <div part="widget-choices">
        ${this.packages.map(this.Package)}
      </div>
      <slot></slot>
    `
	}
}