import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Otkazano.",
  notAllowed: "Otkazano. Ovo ovdje više nije dozvoljeno.",
} satisfies Catalog<SharedMessages>
