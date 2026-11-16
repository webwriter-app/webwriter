import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Tato hodnota zde není povolena.",
  invalidDuration: "Zadejte dobu trvání, například 1:30 nebo 90.",
} satisfies Catalog<SettingsMessages>
