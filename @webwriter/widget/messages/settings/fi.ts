import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Tämä arvo ei ole sallittu täällä.",
  invalidDuration: "Anna kesto, esimerkiksi 1:30 tai 90.",
} satisfies Catalog<SettingsMessages>
