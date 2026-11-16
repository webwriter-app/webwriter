import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "キャンセルしました。",
  notAllowed: "キャンセルしました。ここでは、この操作はできなくなりました。",
} satisfies Catalog<SharedMessages>
