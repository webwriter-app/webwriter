import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Otkazano.",
  notAllowed: "Otkazano. Ovo ovde više nije dozvoljeno.",
} satisfies Catalog<SharedMessages>
