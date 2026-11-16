import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Omissum est.",
  notAllowed: "Omissum est. Hoc hic iam non licet.",
} satisfies Catalog<SharedMessages>
