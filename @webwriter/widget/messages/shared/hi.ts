import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "रद्द किया गया।",
  notAllowed: "रद्द किया गया। यहाँ अब इसकी अनुमति नहीं है।",
} satisfies Catalog<SharedMessages>
