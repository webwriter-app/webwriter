import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "취소되었습니다.",
  notAllowed: "취소되었습니다. 여기서는 더 이상 허용되지 않습니다.",
} satisfies Catalog<SharedMessages>
