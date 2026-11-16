import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "دا ارزښت دلته اجازه نلري.",
  invalidDuration: "یو موده ولیکئ، د بېلګې په توګه 1:30 یا 90.",
} satisfies Catalog<SettingsMessages>
