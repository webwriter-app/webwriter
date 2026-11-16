import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Avbrote.",
  notAllowed: "Avbrote. Dette er ikkje lenger tillate her.",
} satisfies Catalog<SharedMessages>
