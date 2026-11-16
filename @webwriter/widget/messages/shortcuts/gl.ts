import type {Catalog} from "../../messages.js"
import type {ShortcutsMessages} from "./index.js"

export default {
  control: "Ctrl",
  alt: "Alt",
  shift: "Maiús",
  meta: "Meta",
  space: "Espazo",
  enter: "Intro",
  escape: "Esc",
  tab: "Tab",
  backspace: "Retroceso",
  delete: "Supr",
  insert: "Insert",
  home: "Inicio",
  end: "Fin",
  pageUp: "Re Páx",
  pageDown: "Av Páx",
} satisfies Catalog<ShortcutsMessages>
