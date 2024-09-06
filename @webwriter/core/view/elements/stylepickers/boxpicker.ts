import { LitElement, html, css } from "lit"
import { customElement, property } from "lit/decorators.js"
import { localized, msg } from "@lit/localize"

@customElement("ww-box-picker")
export class BoxPicker extends LitElement {
  
	static get styles() {
		return css`

      :host {
        display: block;
        max-width: 400px;
      }

      .box {
        grid-row: 2;
        grid-column: 2;
        border-radius: 2px;

        &.inner {
          padding: 4px;
          width: 80px;
        }

        &:not(.inner) {
          display: grid;
          grid-template-rows: min-content max-content min-content;
          grid-template-columns: min-content max-content min-content;
        }

        &#margin-box {
          background: var(--sl-color-orange-100);
          border: 1px solid var(--sl-color-gray-400);
          width: 100%;
        }

        &#border-box {
          background: var(--sl-color-yellow-100);
          border: 2px solid var(--sl-color-gray-600);
        }

        &#padding-box {
          background: var(--sl-color-green-100);
          border: 1px solid var(--sl-color-gray-300);
        }

        &#content-box {
          background: var(--sl-color-blue-100);
          border: 1px solid var(--sl-color-gray-300);
        }

        & .box-label {
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.8rem;
          padding: 4px;
        }

        & .size {
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.8rem;
          padding: 6px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;

          &.top {
            grid-row: 1;
            grid-column: 2;
          }

          &.right {
            grid-row: 2;
            grid-column: 3;
          }

          &.bottom {
            grid-row: 3;
            grid-column: 2;
          }

          &.left {
            grid-row: 2;
            grid-column: 1;
          }
        }
      }
    `
  }

  handleChange(e: {target: HTMLElement & {value: string}}) {
    this.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
  }

  
  SizeInput = (position: "top" | "right" | "bottom" | "left") => {
    return html`<span class=${`size ${position}`} contenteditable="plaintext-only">${position === "top"? 1: null}</span>`
  }

	render() {
    return html`
      <div>
      </div>
      <div class="box" id="margin-box">
        <span class="box-label">${msg("Margin")}</span>
        ${this.SizeInput("top")}
        ${this.SizeInput("right")}
        ${this.SizeInput("bottom")}
        ${this.SizeInput("left")}
        <div class="box" id="border-box">
          <span class="box-label">${msg("Border")}</span>
          <div id="border-options" class="top-right"></div>
          <div id="background-options" class="bottom-right"></div>
          <div id="shadow-options" class="bottom-left"></div>
          ${this.SizeInput("top")}
          ${this.SizeInput("right")}
          ${this.SizeInput("bottom")}
          ${this.SizeInput("left")}
          <div class="box" id="padding-box">
            <span class="box-label">${msg("Padding")}</span>
            ${this.SizeInput("top")}
            ${this.SizeInput("right")}
            ${this.SizeInput("bottom")}
            ${this.SizeInput("left")}
            <div class="box inner" id="content-box">
              100 x 100
            </div>
          </div>
        </div>
      </div>
    `
  }
}