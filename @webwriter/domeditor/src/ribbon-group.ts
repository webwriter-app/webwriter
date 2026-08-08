import { LitElement, css, html } from "lit"

/** A responsive, labelled collection of ribbon actions. */
export class RibbonGroup extends LitElement {
  static properties = {
    label: {type: String},
  }

  static styles = css`
    :host {
      display: block;
      min-width: 0;
    }

    .group {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      padding: 0 0.5rem;
      border-right: 1px solid #d8dee6;
    }

    :host(:last-of-type) .group {
      border-right: 0;
    }

    .controls {
      display: grid;
      flex: 1 1 auto;
      grid-template-rows: repeat(2, minmax(0, 1fr));
      grid-auto-flow: column;
      grid-auto-columns: 4rem;
      align-content: stretch;
      align-items: center;
      gap: 0.15rem;
      min-width: 0;
      min-height: 0;
      overflow-x: auto;
      overflow-y: hidden;
    }

    @media (max-width: 36rem) {
      .group {
        padding: 0.15rem 0.25rem;
        border-right: 0;
        border-bottom: 1px solid #d8dee6;
      }

      :host(:last-of-type) .group {
        border-bottom: 0;
      }
    }
  `

  label = "Group"

  render() {
    return html`
      <section class="group" aria-label=${this.label}>
        <div class="controls"><slot></slot></div>
      </section>
    `
  }
}

if(!customElements.get("ribbon-group")) {
  customElements.define("ribbon-group", RibbonGroup)
}

declare global {
  interface HTMLElementTagNameMap {
    "ribbon-group": RibbonGroup
  }
}
