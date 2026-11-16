import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Cancelado.",
  notAllowed: "Cancelado. Ya no se permite aquí.",
} satisfies Catalog<SharedMessages>
