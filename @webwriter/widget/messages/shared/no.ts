import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Avbrutt.",
  notAllowed: "Avbrutt. Dette er ikke lenger tillatt her.",
} satisfies Catalog<SharedMessages>
