import { PrintNoteCore } from "@webwriter/widget/print";
import { CoreController } from "./base.js";
import { documentAddress } from "@webwriter/widget/print";
class PrintNote extends CoreController {
  constructor(host, options = {}) {
    super(host, (root) => new PrintNoteCore(host, { ...options, root }));
  }
  /** The note in the widget's language. */
  get text() {
    return this.snapshot.text;
  }
  /** The address of the document that the note shows, or null. */
  get address() {
    return this.snapshot.address;
  }
}
export {
  PrintNote,
  documentAddress
};
