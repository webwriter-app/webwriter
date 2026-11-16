import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Cancelado.",
  notAllowed: "Cancelado. Já não é permitido aqui.",
} satisfies Catalog<SharedMessages>
