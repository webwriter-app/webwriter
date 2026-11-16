import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "እዚ ዋጋ ኣብዚ ኣይፍቀድን።",
  invalidDuration: "ዝጸንሐ ጊዜ ኣእትዉ፣ ንኣብነት 1:30 ወይ 90።",
} satisfies Catalog<SettingsMessages>
