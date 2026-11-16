import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Este valor non está permitido aquí.",
  invalidDuration: "Introduce unha duración, por exemplo 1:30 ou 90.",
} satisfies Catalog<SettingsMessages>
