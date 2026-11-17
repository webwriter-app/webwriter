import {PrintNoteCore} from "@webwriter/widget/print"
import {bindCore} from "./bind.js"

export {documentAddress} from "@webwriter/widget/print"

/**
 * The print note for the widget: `const note = printNoteStore($host())`. It is shown on paper only, for a widget
 * without a print view: the module adds it at the end of the shadow root, or fills a `<p data-ww-print-note></p>`
 * of the template. `$note.text` and `$note.address` are reactive.
 */
export function printNoteStore(host, options = {}) {
  return bindCore(host, options, options => new PrintNoteCore(host, options))
}
