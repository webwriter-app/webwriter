import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Anulowano.",
  notAllowed: "Anulowano. To nie jest już tutaj dozwolone.",
} satisfies Catalog<SharedMessages>
