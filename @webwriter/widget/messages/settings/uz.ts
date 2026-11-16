import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Bu qiymatga bu yerda ruxsat yo‘q.",
  invalidDuration: "Davomiylikni kiriting, masalan, 1:30 yoki 90.",
} satisfies Catalog<SettingsMessages>
