import {html, css} from "lit"
import {LitElementWw} from "@webwriter/lit"
import {customElement} from "lit/decorators.js"


/* Optional LOCALIZATION: Uncomment this after first running `npm run localize` in the command line.
import LOCALIZE from '../localization/generated'
import {msg} from '@lit/localize'
*/

@customElement("---name---")
export class ____classname____ extends LitElementWw {

  /* Optional LOCALIZATION: Uncomment this after first running `npm run localize` in the command line.
  localize = LOCALIZE
  */

  /** Register the classes of custom elements to use in the Shadow DOM here.
   * @example
   * import SlButton from "@shoelace-style/shoelace/dist/components/button/button.component.js"
   * ...
   *   static scopedElements = {"sl-button": SlButton}
   **/
  static scopedElements = {}

  /** Put the styles for your Shadow DOM (what is rendered through render()) here. */
  static styles = css`
    :host {
      display: block;
      box-sizing: border-box;
      inline-size: 100%;
      min-inline-size: 0;
      max-inline-size: 100%;
      block-size: auto;
      container-type: inline-size;
    }
  `

  /** Define your template here and return it. */
  render() {
    return html`Hello, world!`
  }
}