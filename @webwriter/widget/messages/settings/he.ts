import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "ערך זה אינו מותר כאן.",
  invalidDuration: "יש להזין משך, לדוגמה 1:30 או 90.",
} satisfies Catalog<SettingsMessages>
