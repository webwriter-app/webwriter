import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "यह मान यहाँ मान्य नहीं है।",
  invalidDuration: "कोई अवधि दर्ज करें, जैसे 1:30 या 90।",
} satisfies Catalog<SettingsMessages>
