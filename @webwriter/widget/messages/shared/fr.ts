import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Annulé.",
  notAllowed: "Annulé. Ce n’est plus autorisé ici.",
} satisfies Catalog<SharedMessages>
