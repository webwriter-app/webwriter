import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Ləğv edildi.",
  notAllowed: "Ləğv edildi. Buna artıq burada icazə verilmir.",
} satisfies Catalog<SharedMessages>
