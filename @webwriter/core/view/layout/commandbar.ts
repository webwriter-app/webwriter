import { LitElement, css, html } from "lit"
import { customElement, property } from "lit/decorators.js"

import { msg } from "@lit/localize"
import { spreadProps } from "@open-wc/lit-helpers"
import { Command } from "../../viewmodel"

@customElement("ww-commandbar")
export class CommandBar extends LitElement {

	@property({type: Array, attribute: false})
	generalCommands: Command[] = []

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
      --icon-size: 20px;
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

    ww-button::part(base) {
      border: 1px solid var(--sl-color-gray-950);
      border-radius: 100%;
      padding: 0 !important;
    }

	`

	GeneralCommand = (v: Command) =>  html`
		<ww-button variant="icon" ${spreadProps(Object(v))} ?disabled=${v.disabled} class="general-command" @click=${() => v.run()}></ww-button>
	`

	render() {
    return html`
      ${this.generalCommands.map(v => this.GeneralCommand(v))}
    `
	}
}