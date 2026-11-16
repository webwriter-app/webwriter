import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Это значение здесь недопустимо.",
  invalidDuration: "Введите продолжительность, например 1:30 или 90.",
} satisfies Catalog<SettingsMessages>
