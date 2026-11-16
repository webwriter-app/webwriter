import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Questo valore non è consentito qui.",
  invalidDuration: "Inserisci una durata, ad esempio 1:30 o 90.",
} satisfies Catalog<SettingsMessages>
