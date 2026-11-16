import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "रद्द गरियो।",
  notAllowed: "रद्द गरियो। यहाँ अब यसको अनुमति छैन।",
} satisfies Catalog<SharedMessages>
