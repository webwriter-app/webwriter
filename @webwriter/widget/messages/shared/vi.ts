import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Đã hủy.",
  notAllowed: "Đã hủy. Thao tác này không còn được phép ở đây.",
} satisfies Catalog<SharedMessages>
