import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Ta vrednost tu ni dovoljena.",
  invalidDuration: "Vnesite trajanje, na primer 1:30 ali 90.",
} satisfies Catalog<SettingsMessages>
