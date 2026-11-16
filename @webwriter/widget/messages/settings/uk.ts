import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Це значення тут недопустиме.",
  invalidDuration: "Введіть тривалість, наприклад 1:30 або 90.",
} satisfies Catalog<SettingsMessages>
