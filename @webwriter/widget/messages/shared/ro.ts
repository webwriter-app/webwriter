import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Anulat.",
  notAllowed: "Anulat. Acest lucru nu mai este permis aici.",
} satisfies Catalog<SharedMessages>
