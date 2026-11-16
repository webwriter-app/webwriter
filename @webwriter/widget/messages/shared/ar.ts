import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "تم الإلغاء.",
  notAllowed: "تم الإلغاء. لم يعد هذا مسموحًا هنا.",
} satisfies Catalog<SharedMessages>
