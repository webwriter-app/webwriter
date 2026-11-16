import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "ይህ ዋጋ እዚህ አይፈቀድም።",
  invalidDuration: "ቆይታ ያስገቡ፣ ለምሳሌ 1:30 ወይም 90።",
} satisfies Catalog<SettingsMessages>
