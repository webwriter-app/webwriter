import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Hindi pinapayagan dito ang value na ito.",
  invalidDuration: "Maglagay ng tagal, halimbawa 1:30 o 90.",
} satisfies Catalog<SettingsMessages>
