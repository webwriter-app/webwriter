import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Denne verdien er ikke tillatt her.",
  invalidDuration: "Skriv inn en varighet, for eksempel 1:30 eller 90.",
} satisfies Catalog<SettingsMessages>
