import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Šī vērtība šeit nav atļauta.",
  invalidDuration: "Ievadiet ilgumu, piemēram, 1:30 vai 90.",
} satisfies Catalog<SettingsMessages>
