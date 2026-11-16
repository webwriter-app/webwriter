import { ShortcutsCore } from "@webwriter/widget/shortcuts";
import { CoreController } from "./base.js";
class Shortcuts extends CoreController {
  constructor(host, options = {}) {
    super(host, (root) => new ShortcutsCore(host, { rendered: () => host.updateComplete, ...options, root }));
  }
  /** The keys that run an action, as declared. Empty for an action that cannot run from a key. */
  keysOf(action) {
    return this.core.keysOf(action);
  }
  /** The keys of an action as a person reads them on this platform and in the widget's language: `⌘D` or `Ctrl+D`. */
  labelsOf(action) {
    return this.core.labelsOf(action);
  }
  /** Actions started by a key that have not finished. */
  get running() {
    return this.snapshot.running;
  }
}
export {
  Shortcuts
};
