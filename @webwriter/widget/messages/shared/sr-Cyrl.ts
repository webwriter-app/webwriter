import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Отказано.",
  notAllowed: "Отказано. Ово овде више није дозвољено.",
} satisfies Catalog<SharedMessages>
