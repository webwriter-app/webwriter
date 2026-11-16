import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "මෙම අගය මෙහි අවසර නැත.",
  invalidDuration: "කාල ප්‍රමාණයක් ඇතුළත් කරන්න, උදාහරණයක් ලෙස 1:30 හෝ 90.",
} satisfies Catalog<SettingsMessages>
