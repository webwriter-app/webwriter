import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Dibatalkan.",
  notAllowed: "Dibatalkan. Hal ini tidak diizinkan lagi di sini.",
} satisfies Catalog<SharedMessages>
