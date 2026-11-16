import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Չեղարկվեց։",
  notAllowed: "Չեղարկվեց։ Սա այստեղ այլևս թույլատրված չէ։",
} satisfies Catalog<SharedMessages>
