import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Ta wartość jest tutaj niedozwolona.",
  invalidDuration: "Podaj czas trwania, na przykład 1:30 lub 90.",
} satisfies Catalog<SettingsMessages>
