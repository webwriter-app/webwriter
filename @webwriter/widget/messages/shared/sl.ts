import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Preklicano.",
  notAllowed: "Preklicano. Tu to ni več dovoljeno.",
} satisfies Catalog<SharedMessages>
