import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Ši reikšmė čia neleidžiama.",
  invalidDuration: "Įveskite trukmę, pavyzdžiui, 1:30 arba 90.",
} satisfies Catalog<SettingsMessages>
