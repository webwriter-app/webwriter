import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "此处不允许使用该值。",
  invalidDuration: "请输入时长，例如 1:30 或 90。",
} satisfies Catalog<SettingsMessages>
