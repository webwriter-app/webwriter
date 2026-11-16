import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "لغو شد.",
  notAllowed: "لغو شد. این کار دیگر در اینجا مجاز نیست.",
} satisfies Catalog<SharedMessages>
