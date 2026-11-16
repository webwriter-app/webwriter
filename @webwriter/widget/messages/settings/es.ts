import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Este valor no está permitido aquí.",
  invalidDuration: "Introduce una duración, por ejemplo 1:30 o 90.",
} satisfies Catalog<SettingsMessages>
