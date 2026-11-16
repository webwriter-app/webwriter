import type {Catalog} from "../../messages.js"
import type {ShortcutsMessages} from "./index.js"

export default {
  control: "Ctrl",
  alt: "Alt",
  shift: "Maiusc",
  meta: "Meta",
  space: "Spazio",
  enter: "Invio",
  escape: "Esc",
  tab: "Tab",
  backspace: "Backspace",
  delete: "Canc",
  insert: "Ins",
  home: "Home",
  end: "Fine",
  pageUp: "Pag su",
  pageDown: "Pag giù",
} satisfies Catalog<ShortcutsMessages>
