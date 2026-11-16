import {HelpCore} from "@webwriter/widget/help"
import {bindCore} from "./bind.js"

/**
 * Help for the widget: `const help = helpStore($host())`. Write
 * `data-ww-help="text"` on the controls and `data-ww-help-toggle` on the
 * button in the template. `$help.open` and `$help.form` are reactive; the
 * store also has `toggle` and `close`. The overlay is the core's: it is built
 * from the live template and put at the end of the shadow root.
 */
export function helpStore(host, options = {}) {
  return bindCore(host, options, options => new HelpCore(host, options), {methods: ["toggle", "close"]})
}
