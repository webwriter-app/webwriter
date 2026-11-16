import type {Catalog} from "../../messages.js"
import type {ShortcutsMessages} from "./index.js"

export default {
  control: "Ctrl",
  alt: "Alt",
  shift: "Mayús",
  meta: "Meta",
  space: "Espacio",
  enter: "Intro",
  escape: "Esc",
  tab: "Tab",
  backspace: "Retroceso",
  delete: "Supr",
  insert: "Insert",
  home: "Inicio",
  end: "Fin",
  pageUp: "Re Pág",
  pageDown: "Av Pág",
} satisfies Catalog<ShortcutsMessages>
