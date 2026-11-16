import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "此處不允許使用該值。",
  invalidDuration: "請輸入時間長度，例如 1:30 或 90。",
} satisfies Catalog<SettingsMessages>
