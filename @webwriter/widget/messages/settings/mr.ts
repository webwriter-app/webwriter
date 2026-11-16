import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "हे मूल्य येथे स्वीकारले जात नाही.",
  invalidDuration: "कालावधी लिहा, उदाहरणार्थ 1:30 किंवा 90.",
} satisfies Catalog<SettingsMessages>
