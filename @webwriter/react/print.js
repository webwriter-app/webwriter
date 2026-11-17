import {PrintNoteCore} from "@webwriter/widget/print"
import {useCore} from "./base.js"

export {documentAddress} from "@webwriter/widget/print"

/**
 * React binding of the print note: a short, localized note that is shown on paper only, for a widget
 * without a print view. The module adds it at the end of the shadow root, or fills a
 * `<p data-ww-print-note></p>` of the template.
 */
export function usePrintNote(host, options) {
  const {snapshot} = useCore(host, (o) => new PrintNoteCore(host, o), options)
  return {text: snapshot.text, address: snapshot.address}
}
