import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Оваа вредност не е дозволена тука.",
  invalidDuration: "Внесете времетраење, на пример 1:30 или 90.",
} satisfies Catalog<SettingsMessages>
