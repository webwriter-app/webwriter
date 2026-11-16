import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "呢度唔准用呢个值。",
  invalidDuration: "请输入时长，例如 1:30 或者 90。",
} satisfies Catalog<SettingsMessages>
