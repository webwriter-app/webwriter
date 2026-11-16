import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Ova vrednost ovde nije dozvoljena.",
  invalidDuration: "Unesite trajanje, na primer 1:30 ili 90.",
} satisfies Catalog<SettingsMessages>
