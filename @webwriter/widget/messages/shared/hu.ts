import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Megszakítva.",
  notAllowed: "Megszakítva. Ez itt már nem engedélyezett.",
} satisfies Catalog<SharedMessages>
