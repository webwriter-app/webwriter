import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Бұл мәнге мұнда рұқсат жоқ.",
  invalidDuration: "Ұзақтықты енгізіңіз, мысалы, 1:30 немесе 90.",
} satisfies Catalog<SettingsMessages>
