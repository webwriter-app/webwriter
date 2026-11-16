import type {Catalog} from "../../messages.js"
import type {ShortcutsMessages} from "./index.js"

export default {
  control: "Ctrl",
  alt: "Alt",
  shift: "Vaihto",
  meta: "Meta",
  space: "Välilyönti",
  enter: "Enter",
  escape: "Esc",
  tab: "Sarkain",
  backspace: "Askelpalautin",
  delete: "Poista",
  insert: "Insert",
  home: "Home",
  end: "End",
  pageUp: "Page Up",
  pageDown: "Page Down",
} satisfies Catalog<ShortcutsMessages>
