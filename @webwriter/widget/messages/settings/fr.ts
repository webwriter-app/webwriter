import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Cette valeur n’est pas autorisée ici.",
  invalidDuration: "Saisissez une durée, par exemple 1:30 ou 90.",
} satisfies Catalog<SettingsMessages>
