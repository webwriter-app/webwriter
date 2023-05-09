import { LitElement, html } from 'lit';
import {property} from "lit/decorators.js"

export const tagName = 'ww-email-address';

export type Props = {
  address: string
}

export class EmailAddress extends LitElement {

  @property({type: String})
  address: string = ""

  renderRoot: HTMLElement | ShadowRoot = this

	render() {
		return html`
      <a href=${"mailto:" + this.address}>${this.address}</a>
		`
	}
}

customElements.define(tagName, EmailAddress);