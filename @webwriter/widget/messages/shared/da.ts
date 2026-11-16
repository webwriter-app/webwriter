import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Annulleret.",
  notAllowed: "Annulleret. Det er ikke længere tilladt her.",
} satisfies Catalog<SharedMessages>
