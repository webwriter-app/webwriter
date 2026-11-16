import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Гэта значэнне тут недапушчальнае.",
  invalidDuration: "Увядзіце працягласць, напрыклад 1:30 або 90.",
} satisfies Catalog<SettingsMessages>
