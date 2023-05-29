import { LitElement, html } from 'lit';
import {property} from "lit/decorators.js"

export const tagName = 'ww-email-address';

const address = "contact@webwriter.app"

export class EmailAddress extends LitElement {

  renderRoot: HTMLElement | ShadowRoot = this

	render() {
		return html`
      <a href=${"mailto:" + address}>${address}</a>
		`
	}
}

customElements.define(tagName, EmailAddress);