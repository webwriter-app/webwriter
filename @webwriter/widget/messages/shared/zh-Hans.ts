import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "已取消。",
  notAllowed: "已取消。此处不再允许该操作。",
} satisfies Catalog<SharedMessages>
