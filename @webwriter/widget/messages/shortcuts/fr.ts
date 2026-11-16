import type {Catalog} from "../../messages.js"
import type {ShortcutsMessages} from "./index.js"

export default {
  control: "Ctrl",
  alt: "Alt",
  shift: "Maj",
  meta: "Méta",
  space: "Espace",
  enter: "Entrée",
  escape: "Échap",
  tab: "Tab",
  backspace: "Retour arrière",
  delete: "Suppr",
  insert: "Inser",
  home: "Début",
  end: "Fin",
  pageUp: "Page préc.",
  pageDown: "Page suiv.",
} satisfies Catalog<ShortcutsMessages>
