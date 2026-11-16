import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Hierdie waarde word nie hier toegelaat nie.",
  invalidDuration: "Voer 'n tydsduur in, byvoorbeeld 1:30 of 90.",
} satisfies Catalog<SettingsMessages>
