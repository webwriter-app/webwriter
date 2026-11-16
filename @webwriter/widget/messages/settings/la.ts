import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Hic valor hic non licet.",
  invalidDuration: "Insere tempus, exempli gratia 1:30 vel 90.",
} satisfies Catalog<SettingsMessages>
