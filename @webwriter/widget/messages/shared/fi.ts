import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Peruttu.",
  notAllowed: "Peruttu. Tämä ei ole enää sallittua täällä.",
} satisfies Catalog<SharedMessages>
