import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "ਇਹ ਮੁੱਲ ਇੱਥੇ ਮਨਜ਼ੂਰ ਨਹੀਂ ਹੈ।",
  invalidDuration: "ਮਿਆਦ ਦਾਖਲ ਕਰੋ, ਜਿਵੇਂ 1:30 ਜਾਂ 90।",
} satisfies Catalog<SettingsMessages>
