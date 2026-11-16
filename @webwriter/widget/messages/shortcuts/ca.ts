import type {Catalog} from "../../messages.js"
import type {ShortcutsMessages} from "./index.js"

export default {
  control: "Ctrl",
  alt: "Alt",
  shift: "Maj",
  meta: "Meta",
  space: "Espai",
  enter: "Retorn",
  escape: "Esc",
  tab: "Tab",
  backspace: "Retrocés",
  delete: "Supr",
  insert: "Inser",
  home: "Inici",
  end: "Fi",
  pageUp: "Re Pàg",
  pageDown: "Av Pàg",
} satisfies Catalog<ShortcutsMessages>
