import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Ova vrijednost ovdje nije dopuštena.",
  invalidDuration: "Unesite trajanje, na primjer 1:30 ili 90.",
} satisfies Catalog<SettingsMessages>
