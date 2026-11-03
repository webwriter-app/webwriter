import {LitElement, css, html} from "lit"
import infoCircle from "@tabler/icons/outline/info-circle.svg?raw"
import {unsafeSVG} from "lit/directives/unsafe-svg.js"
import {createAnchorPositioner} from "../anchor-positioning.js"
import {embeddablePlatformNames} from "../media"
import {popupAnchorCSS} from "./popup-position"

/** Source help lives in the editor UI and escapes clipped toolbox panes. */
export class MediaSourceInfo extends LitElement {
  static properties = {open: {state: true}}
  static styles = css`
    :host {display: inline-flex;}
    button {display: grid; place-items: center; width: .875rem; height: .875rem; border: 0; padding: 0; background: transparent; color: #6b7280; cursor: help;}
    button:hover {color: #0284c7;}
    button:focus-visible {outline: 2px solid #3977c7; outline-offset: 2px;}
    svg {width: .875rem; height: .875rem;}
    .popup {position: fixed; inset: auto; margin: 0; box-sizing: border-box; width: 250px; max-width: calc(100vw - 16px); padding: .75rem; border: 0; border-radius: .4rem; background: #252629; color: white; box-shadow: 0 3px 12px #0003; font: 12px/1.45 system-ui, sans-serif;}
    .popup p {margin: 0 0 .5rem;}
    ul {display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .2rem .75rem; padding: 0; margin: 0; list-style: none; color: #bbd6f7;}
    [hidden] {display: none;}
  `
  open = false
  private positioner = createAnchorPositioner(document)

  private async show() {
    this.open = true
    await this.updateComplete
    if(!this.open || !this.isConnected) return
    const popup = this.renderRoot.querySelector<HTMLElement>(".popup")!
    popup.showPopover?.()
    this.positioner.bind(popup, this, popupAnchorCSS(8))
    this.positioner.refresh()
  }

  hide() {
    const popup = this.renderRoot.querySelector<HTMLElement>(".popup")
    popup?.hidePopover?.()
    if(popup) this.positioner.release(popup)
    this.open = false
  }

  disconnectedCallback() {
    this.hide()
    this.positioner.destroy()
    super.disconnectedCallback()
  }

  render() {
    return html`<button type="button" aria-label="Supported link sources" aria-describedby="media-source-explanation"
      @mouseenter=${() => this.show()} @mouseleave=${() => this.hide()}
      @focus=${() => this.show()} @blur=${() => this.hide()}>${unsafeSVG(infoCircle)}</button>
      <div id="media-source-explanation" class="popup" role="tooltip" popover="manual" ?hidden=${!this.open}>
        <p>Paste a supported link to embed content from:</p>
        <ul>${embeddablePlatformNames.map(name => html`<li>${name}</li>`)}</ul>
      </div>`
  }
}
if(!customElements.get("media-source-info")) customElements.define("media-source-info", MediaSourceInfo)
