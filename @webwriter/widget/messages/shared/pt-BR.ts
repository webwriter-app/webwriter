import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Cancelado.",
  notAllowed: "Cancelado. Isso não é mais permitido aqui.",
} satisfies Catalog<SharedMessages>
