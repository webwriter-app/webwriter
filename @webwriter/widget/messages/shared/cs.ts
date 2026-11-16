import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Zrušeno.",
  notAllowed: "Zrušeno. Zde to už není povoleno.",
} satisfies Catalog<SharedMessages>
