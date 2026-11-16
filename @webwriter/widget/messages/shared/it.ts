import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Annullato.",
  notAllowed: "Annullato. Qui non è più consentito.",
} satisfies Catalog<SharedMessages>
