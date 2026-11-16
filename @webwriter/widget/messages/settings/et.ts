import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "See väärtus pole siin lubatud.",
  invalidDuration: "Sisesta kestus, näiteks 1:30 või 90.",
} satisfies Catalog<SettingsMessages>
