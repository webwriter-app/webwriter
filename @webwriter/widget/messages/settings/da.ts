import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Denne værdi er ikke tilladt her.",
  invalidDuration: "Angiv en varighed, for eksempel 1:30 eller 90.",
} satisfies Catalog<SettingsMessages>
