import { DragCore } from "@webwriter/widget/drag";
import { CoreController } from "./base.js";
class Drag extends CoreController {
  constructor(host, options = {}) {
    super(host, (root) => new DragCore(host, { rendered: () => host.updateComplete, ...options, root }));
  }
  /** The item being dragged or picked up, if any. */
  get item() {
    return this.core.getSnapshot().item;
  }
  /** How the item was picked up: by a pointer drag, with the keyboard or by a click. */
  get via() {
    return this.core.getSnapshot().via;
  }
}
export {
  Drag
};
