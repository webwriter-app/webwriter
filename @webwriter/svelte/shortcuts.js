import {ShortcutsCore} from "@webwriter/widget/shortcuts"
import {bindCore} from "./bind.js"

/**
 * Shortcuts for the widget: `const shortcuts = shortcutsStore($host())`. The
 * keys are declared on `static actions` of the class, with the method of the
 * same name; a key runs it as one undo step that stays open until the
 * component has rendered; an action method that returns `false` declines the
 * key, which then keeps its other meaning. A button marked `data-ww-shortcut="action"` gets
 * its `aria-keyshortcuts`. `$shortcuts.running` lists the unfinished actions;
 * the store also has `keysOf` and `labelsOf`.
 */
export function shortcutsStore(host, options = {}) {
  return bindCore(host, options, options => new ShortcutsCore(host, options), {rendered: true, methods: ["keysOf", "labelsOf"]})
}
