import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Тази стойност не е позволена тук.",
  invalidDuration: "Въведете продължителност, например 1:30 или 90.",
} satisfies Catalog<SettingsMessages>
