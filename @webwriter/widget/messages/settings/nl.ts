import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Deze waarde is hier niet toegestaan.",
  invalidDuration: "Voer een duur in, bijvoorbeeld 1:30 of 90.",
} satisfies Catalog<SettingsMessages>
