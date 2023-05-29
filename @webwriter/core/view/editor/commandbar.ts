import { LitElement, css, html } from "lit"
import { customElement, property } from "lit/decorators.js"

import { msg } from "@lit/localize"
import { spreadProps } from "@open-wc/lit-helpers"
import { CommandEntry, CommandEvent } from "../../viewmodel"

@customElement("ww-commandbar")
export class CommandBar extends LitElement {

	emitCommand = (id: string) => this.dispatchEvent(CommandEvent(id))

	@property({type: Array, attribute: false})
	generalCommands: CommandEntry[] = []

  @property({type: Object, attribute: false})
	previewCommand: CommandEntry

  @property({type: Boolean, attribute: true, reflect: true})
	previewing = false

	static styles = css`

		:host {
			z-index: 100;
			padding: 10px;
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: flex-end;
      gap: 1ch;
      box-sizing: border-box;
      height: 100%;
		}

    .general-command::part(base) {
			border: 1px solid var(--sl-color-neutral-950);
			border-radius: 100%;
			padding: 2px;
		}

    .general-command::part(label) {
      padding: 0;
    }

    .general-command[disabled]::part(base) {
      border-color: var(--sl-color-neutral-600);
    }

		.general-command::part(base):hover {
			border: 1px solid var(--sl-color-primary-600);
		}

    :host([previewing]) .general-command:not(#togglePreview) {
      display: none;
    }

    :host(:not([previewing])) .previewing-text {
      display: none;
    }

    :host([previewing]) #togglePreview::part(base) {
      color: var(--sl-color-warning-600);
    }


    .previewing-text {
      display: inline-flex;
      margin-right: 1ch;
      align-items: center;
      font-size: 1rem;
    }

    #togglePreview sl-icon {
			border: 1px solid var(--sl-color-neutral-600);
			border-radius: 100%;
			padding: 2px;
      color: var(--sl-color-neutral-600);
      padding: 4.5px !important;
    }

    :host([previewing]) sl-icon {
      border-color: var(--sl-color-warning-600) !important;
    }

    #togglePreview::part(label) {
      padding: 0;
      display: flex;
      align-items: center;
      font-size: 1.15rem;
    }

    #togglePreview::part(base):hover {
      opacity: 0.8;
      color: var(--sl-color-warning-600) !important;
    }

    #togglePreview::part(base):active {
      color: var(--sl-color-warning-700) !important;
    }

    #togglePreview::part(base):active sl-icon {
      border-color: var(--sl-color-warning-700) !important;
    }

    #togglePreview:hover sl-icon {
      border-color: var(--sl-color-warning-600) !important;
      color: var(--sl-color-warning-600) !important; 
    }

    #togglePreview::part(base) {
      background: none;
      height: auto;
      border: unset !important;
      border-radius: unset !important;
      line-height: unset !important;
      font-size: inherit !important;
      display: flex;
    }

    ww-button::part(base) {
      border: 1px solid var(--sl-color-gray-950);
      border-radius: 100%;
      padding: 0 !important;
    }

	`

	GeneralCommand = (v: CommandEntry) =>  html`
		<ww-button variant="icon" ${spreadProps(v)} ?disabled=${v.disabled} class="general-command" @click=${() => this.emitCommand(v.id)}></ww-button>
	`

	render() {
    return html`
      ${this.generalCommands.map(v => this.GeneralCommand(v))}
      <sl-button variant="warning" id="togglePreview" @click=${() => this.emitCommand(this.previewCommand.id)}>
        <span class="previewing-text">${msg("Preview Mode")}</span>
        <sl-icon name=${this.previewing? "eye-slash": "eye"}></sl-icon>
      </sl-button>
    `
	}
}