import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Această valoare nu este permisă aici.",
  invalidDuration: "Introduceți o durată, de exemplu 1:30 sau 90.",
} satisfies Catalog<SettingsMessages>
