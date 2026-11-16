import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Giá trị này không được phép ở đây.",
  invalidDuration: "Hãy nhập khoảng thời gian, ví dụ 1:30 hoặc 90.",
} satisfies Catalog<SettingsMessages>
