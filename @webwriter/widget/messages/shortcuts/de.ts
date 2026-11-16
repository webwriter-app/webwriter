import type {Catalog} from "../../messages.js"
import type {ShortcutsMessages} from "./index.js"

export default {
  control: "Strg",
  alt: "Alt",
  shift: "Umschalt",
  meta: "Meta",
  space: "Leertaste",
  enter: "Eingabe",
  escape: "Esc",
  tab: "Tab",
  backspace: "Rücktaste",
  delete: "Entf",
  insert: "Einfg",
  home: "Pos1",
  end: "Ende",
  pageUp: "Bild auf",
  pageDown: "Bild ab",
} satisfies Catalog<ShortcutsMessages>
