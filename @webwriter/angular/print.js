import {computed} from "@angular/core"
import {PrintNoteCore} from "@webwriter/widget/print"
import {injectModule} from "./base.js"

export {documentAddress} from "@webwriter/widget/print"

/** Binds the print note, shown on paper only: it adds itself at the end of the shadow root, or fills a `<p data-ww-print-note>` of the template. */
export function injectPrintNote(options = {}) {
  const snapshot = injectModule(PrintNoteCore, options)
  const {core} = snapshot
  return {
    core,
    snapshot,
    text: computed(() => snapshot().text),
    address: computed(() => snapshot().address),
  }
}
