import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "已取消。",
  notAllowed: "已取消。此處不再允許該操作。",
} satisfies Catalog<SharedMessages>
