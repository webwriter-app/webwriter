import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Cancelado.",
  notAllowed: "Cancelado. Isto xa non está permitido aquí.",
} satisfies Catalog<SharedMessages>
