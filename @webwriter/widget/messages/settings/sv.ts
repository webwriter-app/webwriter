import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Det här värdet är inte tillåtet här.",
  invalidDuration: "Ange en varaktighet, till exempel 1:30 eller 90.",
} satisfies Catalog<SettingsMessages>
