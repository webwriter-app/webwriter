import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "この値はここでは使用できません。",
  invalidDuration: "時間を入力してください。例:1:30 または 90",
} satisfies Catalog<SettingsMessages>
