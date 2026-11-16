import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Denne verdien er ikkje tillaten her.",
  invalidDuration: "Skriv inn ei varigheit, til dømes 1:30 eller 90.",
} satisfies Catalog<SettingsMessages>
