import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Táto hodnota tu nie je povolená.",
  invalidDuration: "Zadajte trvanie, napríklad 1:30 alebo 90.",
} satisfies Catalog<SettingsMessages>
