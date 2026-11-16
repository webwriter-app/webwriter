import type {Catalog} from "../../messages.js"
import type {ShortcutsMessages} from "./index.js"

export default {
  control: "Ctrl",
  alt: "Alt",
  shift: "Skift",
  meta: "Meta",
  space: "Mellanslag",
  enter: "Retur",
  escape: "Esc",
  tab: "Tabb",
  backspace: "Backsteg",
  delete: "Delete",
  insert: "Insert",
  home: "Home",
  end: "End",
  pageUp: "Page Up",
  pageDown: "Page Down",
} satisfies Catalog<ShortcutsMessages>
