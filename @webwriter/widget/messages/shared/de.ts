import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Abgebrochen.",
  notAllowed: "Abgebrochen. Das ist hier nicht mehr erlaubt.",
} satisfies Catalog<SharedMessages>
