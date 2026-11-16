import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "هذه القيمة غير مسموح بها هنا.",
  invalidDuration: "أدخل مدة، مثل 1:30 أو 90.",
} satisfies Catalog<SettingsMessages>
