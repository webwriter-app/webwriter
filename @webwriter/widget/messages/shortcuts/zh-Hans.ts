import type {Catalog} from "../../messages.js"
import type {ShortcutsMessages} from "./index.js"

export default {
  control: "Ctrl",
  alt: "Alt",
  shift: "Shift",
  meta: "Meta",
  space: "空格键",
  enter: "Enter",
  escape: "Esc",
  tab: "Tab",
  backspace: "退格键",
  delete: "Delete",
  insert: "Insert",
  home: "Home",
  end: "End",
  pageUp: "Page Up",
  pageDown: "Page Down",
} satisfies Catalog<ShortcutsMessages>
