import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Отказано.",
  notAllowed: "Отказано. Това вече не е позволено тук.",
} satisfies Catalog<SharedMessages>
