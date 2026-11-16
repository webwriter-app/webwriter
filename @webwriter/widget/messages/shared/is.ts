import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Hætt við.",
  notAllowed: "Hætt við. Þetta er ekki lengur leyfilegt hér.",
} satisfies Catalog<SharedMessages>
