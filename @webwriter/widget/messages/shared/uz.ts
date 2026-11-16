import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Bekor qilindi.",
  notAllowed: "Bekor qilindi. Bunga endi bu yerda ruxsat yo‘q.",
} satisfies Catalog<SharedMessages>
