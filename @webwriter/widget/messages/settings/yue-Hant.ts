import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "呢度唔准用呢個值。",
  invalidDuration: "請輸入時長，例如 1:30 或者 90。",
} satisfies Catalog<SettingsMessages>
