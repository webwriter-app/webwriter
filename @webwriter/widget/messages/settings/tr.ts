import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Bu değere burada izin verilmiyor.",
  invalidDuration: "Bir süre girin, örneğin 1:30 veya 90.",
} satisfies Catalog<SettingsMessages>
