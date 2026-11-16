import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Kjo vlerë nuk lejohet këtu.",
  invalidDuration: "Shkruani një kohëzgjatje, për shembull 1:30 ose 90.",
} satisfies Catalog<SettingsMessages>
