import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "İptal edildi.",
  notAllowed: "İptal edildi. Buna artık burada izin verilmiyor.",
} satisfies Catalog<SharedMessages>
