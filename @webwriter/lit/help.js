import { HelpCore } from "@webwriter/widget/help";
import { CoreController } from "./base.js";
class Help extends CoreController {
  constructor(host, options = {}) {
    super(host, (root) => new HelpCore(host, { ...options, root }));
  }
  /** Whether the overlay is shown. */
  get open() {
    return this.snapshot.open;
  }
  /** "labels", or "list" when the widget is too small for labels. Null while closed. */
  get form() {
    return this.snapshot.form;
  }
  /** Opens or closes the overlay, for menus. A `data-ww-help-toggle` button needs no code. */
  toggle(force) {
    this.core.toggle(force);
  }
  /** Closes the overlay. */
  close() {
    this.core.close();
  }
}
export {
  Help
};
