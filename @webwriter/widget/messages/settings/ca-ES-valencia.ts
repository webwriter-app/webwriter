import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Este valor no es permet ací.",
  invalidDuration: "Introduïu una durada, per exemple 1:30 o 90.",
} satisfies Catalog<SettingsMessages>
