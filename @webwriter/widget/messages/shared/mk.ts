import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Откажано.",
  notAllowed: "Откажано. Ова повеќе не е дозволено тука.",
} satisfies Catalog<SharedMessages>
