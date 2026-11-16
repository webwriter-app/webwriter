import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Dieser Wert ist hier nicht erlaubt.",
  invalidDuration: "Bitte eine Dauer eingeben, zum Beispiel 1:30 oder 90.",
} satisfies Catalog<SettingsMessages>
