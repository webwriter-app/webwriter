import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Þetta gildi er ekki leyft hér.",
  invalidDuration: "Sláðu inn tímalengd, til dæmis 1:30 eða 90.",
} satisfies Catalog<SettingsMessages>
