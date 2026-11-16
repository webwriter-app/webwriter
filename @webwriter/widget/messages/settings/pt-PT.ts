import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Este valor não é permitido aqui.",
  invalidDuration: "Introduza uma duração, por exemplo 1:30 ou 90.",
} satisfies Catalog<SettingsMessages>
