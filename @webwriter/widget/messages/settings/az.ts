import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Bu dəyərə burada icazə verilmir.",
  invalidDuration: "Müddət daxil edin, məsələn, 1:30 və ya 90.",
} satisfies Catalog<SettingsMessages>
