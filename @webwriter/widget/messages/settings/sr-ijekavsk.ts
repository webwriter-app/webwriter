import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Ова вриједност овдје није дозвољена.",
  invalidDuration: "Унесите трајање, на примјер 1:30 или 90.",
} satisfies Catalog<SettingsMessages>
