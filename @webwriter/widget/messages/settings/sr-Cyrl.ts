import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Ова вредност овде није дозвољена.",
  invalidDuration: "Унесите трајање, на пример 1:30 или 90.",
} satisfies Catalog<SettingsMessages>
