import { msg } from "@lit/localize"
import { LitElement, css, html } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import { classMap } from "lit/directives/class-map.js"
import { EditorState, Command as PmCommand } from "prosemirror-state"

import { Package, watch } from "../../model"
import { unscopePackageName, prettifyPackageName, camelCaseToSpacedCase } from "../../utility"
import { SlProgressBar } from "@shoelace-style/shoelace"
import { Command } from "../../viewmodel"
import { App } from ".."

@customElement("ww-palette")
export class Palette extends LitElement {

  @property({attribute: false})
  app: App

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
  editorState: EditorState

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
      display: grid;
      grid-template-columns: repeat(10, 1fr);
      grid-auto-rows: 30px;
      max-width: 420px;
      z-index: 10000;
			padding: 0 10px;
      margin-left: auto;
      gap: 5px;
      grid-auto-flow: row dense;
      max-height: 100%;
      overflow-y: auto;
    }

    .inline-commands-wrapper {
      display: contents;
    }

    .package-card {

      &[inert] {
        &::part(base) {
          background-color: transparent;
          box-shadow: none;
          border-color: var(--sl-color-gray-300);
        }

        & sl-progress-bar {
          visibility: hidden;
        }

        & .title {
          color: var(--sl-color-gray-400);
        }
      }

      &::part(base) {
        --padding: 10px;
        min-width: 180px;
        height: 100%;
        position: relative;
        display: block;
      }

      &::part(body) {
        padding: 5px;
        height: 100%;
        overflow-y: hidden;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;
      }

      & .title {
        display: flex;
        flex-direction: row;
        align-items: center;
        font-size: 0.9rem;
        height: 2ch;
        user-select: none;
        width: 100%;
      }

      &:not(.error) .title:hover {
        color: var(--sl-color-primary-600);
			  cursor: pointer;
      }
      &.error .title {
        color: var(--sl-color-danger-600);
        cursor: help;
      }
      &.error sl-tooltip {
        --max-width: 500px;
      }

      &.error .error-content {
        font-family: var(--sl-font-mono);
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
      }
    }

    .container-card {
      order: 0;
      grid-row: span 2;

      &::part(base) {
        min-width: unset;
      }

      & .title {

        & sl-icon {
          --icon-size: 24px;
          width: 24px;
          height: 24px;
        }
      }
    }

    @media only screen and (max-width: 1731px) {
      :host {
        grid-template-columns: repeat(5, 1fr);
      }
    }

    @media only screen and (max-width: 1300px) {
      :host {
				display: flex;
				flex-direction: row;
				align-items: flex-start;
				background: #f1f1f1;
        padding-top: 5px;
				height: 55px;
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

      .package-card {
        flex-shrink: 0;

        &::part(base) {
          min-width: unset;
        }
      }

      .container-card {
        & .title {
          & sl-icon {
            --icon-size: 20px;
            width: 20px;
            height: 20px;
          }
        }
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

	private handleClickCard(pkg: Package | Command) {
    const isLeaf = "name" in pkg
		if(isLeaf && !pkg.importError) {
			this.addingWidget = pkg.name
			this.widgetAddProgress = 100
			clearInterval(this.widgetAddInterval)
      this.emitChangeWidget(this.addingWidget!)
		}
    else if(!isLeaf && !pkg.disabled) {
      this.addingWidget = pkg.id;
      (pkg as Command).run()
    }
	}

	static FormattedError(pkg: Package) {
		let err = pkg.importError
			?.replaceAll("X [ERROR] ", "")
			?.replaceAll(/\n\d* error(s)?/g, "")
			.trim()
		return err
	}

	handleMouseInWidgetAdd = (pkg: Package | Command) => {
    const isLeaf = "name" in pkg
		if(isLeaf && !pkg.importError && this.showWidgetPreview) {
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
		clearInterval(this.widgetAddInterval)
		this.emitMouseOutWidgetAdd(name)
	}

  ContainerCard = (cmds: Command[]) => {
    const cmd = cmds[(cmds.findIndex(cmd => cmd.active) + 1) % cmds.length]
    return html`<sl-card class=${classMap({"package-card": true, "container-card": true})}>
		<sl-tooltip placement="left-start" class="package-tooltip" hoist trigger="hover">
			<span ?inert=${cmd.disabled} @click=${() => this.handleClickCard(cmd)} class="title" @mouseenter=${() => this.handleMouseInWidgetAdd(cmd)} @mouseleave=${() => this.handleMouseOutWidgetAdd(unscopePackageName(cmd.id))}>
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

	BlockCard = (pkg: Package) => {
    const {importError, watching, name, version} = pkg
    const formattedError = Palette.FormattedError(pkg)
    const label = prettifyPackageName(name)
    return html`<sl-card class=${classMap({error: !!importError, "package-card": true, "block-card": true})}>
		<sl-tooltip placement="left-start" class="package-tooltip" hoist trigger="hover">
			<span title=${!importError? msg("Add this widget"): ""} @click=${() => this.handleClickCard(pkg)} class="title" @mouseenter=${() => this.handleMouseInWidgetAdd(pkg)} @mouseleave=${() => this.handleMouseOutWidgetAdd(unscopePackageName(name))}>
				${!watching? null: html`
					<sl-icon title=${msg("Watching files")} name="bolt"></sl-icon>
				`}
				<span>${label}</span>
			</span>
			${importError
				? html`
					<pre class="error-content" slot="content">
						${formattedError}
					</pre>
				`: html`
					<span slot="content">
            <b><code>${name} ${version}</code></b>
						<div>${pkg.description || msg("No description provided")}</div>
					</span>
				`}
		</sl-tooltip>
		<sl-progress-bar value=${name === this.addingWidget? this.widgetAddProgress: 0}></sl-progress-bar>
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

	render() {
    return html`
      ${this.app.commands.groupedContainerCommands.map(this.Card)}
      ${this.packages.map(this.Card)}
      ${this.app.commands.phrasingCommands.map(this.Card)}
    `
	}
}