import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Zrušené.",
  notAllowed: "Zrušené. Tu to už nie je povolené.",
} satisfies Catalog<SharedMessages>
